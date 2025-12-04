import type { APIRoute } from 'astro';
import { createClient } from 'redis';

export const prerender = false;

const ARTIST_MAP: Record<string, string> = {
  'bts': '3Nrfpe0tUJi4K4DXYWgMUX'
};

// Helper para conectar a Redis
async function getRedisClient() {
  const client = createClient({
    url: import.meta.env.REDIS_URL
  });
  
  await client.connect();
  return client;
}

// Función para detectar si un álbum es live, remix, o no deseado
function isUnwantedAlbum(albumName: string): boolean {
  const lowerName = albumName.toLowerCase();
  const unwantedKeywords = [
    'live',
    'concert',
    'tour',
    'remix',
    'instrumental',
    'karaoke',
    'rehearsal',
    'demo',
    'acoustic',
    'unplugged',
    'on stage',
    'in concert',
    'special performance'
  ];
  
  return unwantedKeywords.some(keyword => lowerName.includes(keyword));
}

// Función para limpiar el nombre de la canción
function cleanTrackName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, '') // Elimina todo entre paréntesis o corchetes
    .replace(/\s*-\s*(feat\.?|ft\.?).*$/i, '') // Mantiene feat pero limpia para comparar
    .trim();
}

// Función para detectar si es una versión alternativa individual
function isAlternateVersion(name: string): boolean {
  const lowerName = name.toLowerCase();
  const alternateKeywords = [
    'skit',
    'intro',
    'outro',
    'interlude',
    '(japanese ver',
    '(english ver',
    '(chinese ver',
    '(korean ver'
  ];
  
  return alternateKeywords.some(keyword => lowerName.includes(keyword));
}

// Función para obtener la versión "principal" entre duplicados
function getPreferredTrack(tracks: any[]): any {
  // Prioridad: versión sin palabras clave > versión más corta > primera encontrada
  const nonAlternate = tracks.find(t => !isAlternateVersion(t.name));
  if (nonAlternate) return nonAlternate;
  
  // Si todas son alternativas, toma la más corta (probablemente la original)
  return tracks.reduce((shortest, current) => 
    current.name.length < shortest.name.length ? current : shortest
  );
}

export const GET: APIRoute = async ({ params }) => {
  const artistId = params.artistId;
  
  if (!artistId || !ARTIST_MAP[artistId]) {
    return new Response(JSON.stringify({ error: 'Artista no encontrado' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const spotifyArtistId = ARTIST_MAP[artistId];
  const cacheKey = `tracks:${artistId}:v2`;

  let redis;
  
  try {
    // Verificar variables de entorno
    const clientId = import.meta.env.SPOTIFY_CLIENT_ID;
    const clientSecret = import.meta.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('Missing Spotify credentials');
      return new Response(JSON.stringify({ 
        error: 'Configuración de Spotify incompleta' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Intentar conectar a Redis y obtener cache
    try {
      redis = await getRedisClient();
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        console.log('Cache hit para:', artistId);
        await redis.quit();
        return new Response(cached, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (redisError) {
      console.warn('Redis error, continuando sin cache:', redisError);
      if (redis) await redis.quit().catch(() => {});
      redis = null;
    }

    // Crear credenciales base64
    const credentials = btoa(`${clientId}:${clientSecret}`);

    // Obtener token de Spotify
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      throw new Error(`Spotify token error: ${tokenResponse.status}`);
    }

    const { access_token } = await tokenResponse.json();

    // Obtener álbumes del artista
    const albumsResponse = await fetch(
      `https://api.spotify.com/v1/artists/${spotifyArtistId}/albums?include_groups=album,single&market=US&limit=50`,
      {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }
    );

    if (!albumsResponse.ok) {
      throw new Error(`Spotify albums error: ${albumsResponse.status}`);
    }

    const albumsData = await albumsResponse.json();
    
    // FILTRAR ÁLBUMES NO DESEADOS AQUÍ
    const filteredAlbums = albumsData.items.filter((album: any) => 
      !isUnwantedAlbum(album.name)
    );

    console.log(`Álbumes originales: ${albumsData.items.length}, Después de filtrar: ${filteredAlbums.length}`);
    
    // Obtener tracks solo de álbumes filtrados
    const trackPromises = filteredAlbums.map((album: any) =>
      fetch(`https://api.spotify.com/v1/albums/${album.id}/tracks`, {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }).then(res => res.json())
    );

    const tracksData = await Promise.all(trackPromises);
    
    // Combinar y limpiar datos
    const allTracks = tracksData.flatMap((data, idx) => 
      data.items
        .filter((track: any) => !isAlternateVersion(track.name)) // Filtrar skits, intros, etc.
        .map((track: any) => ({
          id: track.id,
          name: track.name,
          image: filteredAlbums[idx].images[0]?.url || '',
          albumName: filteredAlbums[idx].name,
          previewUrl: track.preview_url,
          cleanName: cleanTrackName(track.name)
        }))
    );

    // Agrupar por nombre limpio y elegir la mejor versión
    const trackGroups = new Map<string, any[]>();
    
    allTracks.forEach(track => {
      const clean = track.cleanName;
      if (!trackGroups.has(clean)) {
        trackGroups.set(clean, []);
      }
      trackGroups.get(clean)!.push(track);
    });

    // Obtener la versión preferida de cada grupo
    const uniqueTracks = Array.from(trackGroups.values())
      .map(group => getPreferredTrack(group))
      .map(track => {
        // Eliminar la propiedad cleanName antes de enviar
        const { cleanName, ...trackData } = track;
        return trackData;
      });

    console.log(`Tracks únicos finales: ${uniqueTracks.length}`);

    const result = {
      artist: artistId,
      tracks: uniqueTracks,
      total: uniqueTracks.length
    };

    // Intentar guardar en cache
    try {
      if (!redis) {
        redis = await getRedisClient();
      }
      await redis.setEx(cacheKey, 86400, JSON.stringify(result)); // 24 horas
      await redis.quit();
    } catch (redisError) {
      console.warn('Redis set error:', redisError);
      if (redis) await redis.quit().catch(() => {});
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    if (redis) await redis.quit().catch(() => {});
    console.error('Error fetching Spotify data:', error);
    return new Response(JSON.stringify({ 
      error: 'Error al obtener datos de Spotify',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};