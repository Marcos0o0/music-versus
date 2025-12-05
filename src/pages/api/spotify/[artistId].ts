import type { APIRoute } from 'astro';
import { createClient } from 'redis';

export const prerender = false;

const ARTIST_MAP: Record<string, string> = {
  'bts': '3Nrfpe0tUJi4K4DXYWgMUX'
};

async function getRedisClient() {
  const client = createClient({
    url: import.meta.env.REDIS_URL
  });
  await client.connect();
  return client;
}

function isUnwantedAlbum(albumName: string): boolean {
  const lowerName = albumName.toLowerCase();
  const unwantedKeywords = [
    'live', 'concert', 'tour', 'remix', 'instrumental', 'karaoke',
    'rehearsal', 'demo', 'acoustic', 'unplugged', 'on stage', 'in concert'
  ];
  return unwantedKeywords.some(keyword => lowerName.includes(keyword));
}

function cleanTrackName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, '')
    .replace(/\s*-\s*(feat\.?|ft\.?).*$/i, '')
    .trim();
}

function isAlternateVersion(name: string): boolean {
  const lowerName = name.toLowerCase();
  const alternateKeywords = [
    'skit', 'intro', 'outro', 'interlude',
    '(japanese ver', '(english ver', '(chinese ver', '(korean ver'
  ];
  return alternateKeywords.some(keyword => lowerName.includes(keyword));
}

function getPreferredTrack(tracks: any[]): any {
  const nonAlternate = tracks.find(t => !isAlternateVersion(t.name));
  if (nonAlternate) return nonAlternate;
  return tracks.reduce((shortest, current) => 
    current.name.length < shortest.name.length ? current : shortest
  );
}

// Función para buscar preview en Deezer
async function searchDeezerPreview(trackName: string, artistName: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${artistName} ${trackName}`);
    const response = await fetch(`https://api.deezer.com/search?q=${query}&limit=1`);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.data && data.data.length > 0 && data.data[0].preview) {
      return data.data[0].preview;
    }
    return null;
  } catch (error) {
    console.error('Error searching Deezer:', error);
    return null;
  }
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
  const cacheKey = `tracks:${artistId}:v3-deezer`;

  let redis;
  
  try {
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

    // Intentar obtener de cache
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

    // Obtener álbumes
    const albumsResponse = await fetch(
      `https://api.spotify.com/v1/artists/${spotifyArtistId}/albums?include_groups=album,single&market=US&limit=50`,
      { headers: { 'Authorization': `Bearer ${access_token}` } }
    );

    if (!albumsResponse.ok) {
      throw new Error(`Spotify albums error: ${albumsResponse.status}`);
    }

    const albumsData = await albumsResponse.json();
    const filteredAlbums = albumsData.items.filter((album: any) => 
      !isUnwantedAlbum(album.name)
    );

    console.log(`Álbumes: ${albumsData.items.length} → ${filteredAlbums.length} (después de filtrar)`);
    
    // Obtener tracks
    const trackPromises = filteredAlbums.map((album: any) =>
      fetch(`https://api.spotify.com/v1/albums/${album.id}/tracks`, {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }).then(res => res.json())
    );

    const tracksData = await Promise.all(trackPromises);
    
    const allTracks = tracksData.flatMap((data, idx) => 
      data.items
        .filter((track: any) => !isAlternateVersion(track.name))
        .map((track: any) => ({
          id: track.id,
          name: track.name,
          image: filteredAlbums[idx].images[0]?.url || '',
          albumName: filteredAlbums[idx].name,
          previewUrl: track.preview_url,
          cleanName: cleanTrackName(track.name)
        }))
    );

    // Agrupar por nombre limpio
    const trackGroups = new Map<string, any[]>();
    
    allTracks.forEach(track => {
      const clean = track.cleanName;
      if (!trackGroups.has(clean)) {
        trackGroups.set(clean, []);
      }
      trackGroups.get(clean)!.push(track);
    });

    const uniqueTracks = Array.from(trackGroups.values())
      .map(group => getPreferredTrack(group));

    console.log(`Tracks únicos: ${uniqueTracks.length}`);
    console.log(`Con preview de Spotify: ${uniqueTracks.filter(t => t.previewUrl).length}`);
    
    console.log('Buscando previews en Deezer...');
    
    const tracksWithPreviews = await Promise.all(
      uniqueTracks.map(async (track) => {
        if (!track.previewUrl) {
          const deezerPreview = await searchDeezerPreview(track.name, 'BTS');
          if (deezerPreview) {
            console.log(`Deezer preview encontrado para: ${track.name}`);
          }
          return {
            ...track,
            previewUrl: deezerPreview || track.previewUrl,
            previewSource: deezerPreview ? 'deezer' : null
          };
        }
        return {
          ...track,
          previewSource: 'spotify'
        };
      })
    );

    const previewCount = tracksWithPreviews.filter(t => t.previewUrl).length;
    console.log(`Total con preview: ${previewCount}/${tracksWithPreviews.length}`);

    const result = {
      artist: artistId,
      tracks: tracksWithPreviews.map(track => {
        const { cleanName, ...trackData } = track;
        return trackData;
      }),
      total: tracksWithPreviews.length,
      previewStats: {
        total: tracksWithPreviews.length,
        withPreview: previewCount,
        spotify: tracksWithPreviews.filter(t => t.previewSource === 'spotify').length,
        deezer: tracksWithPreviews.filter(t => t.previewSource === 'deezer').length
      }
    };

    // Guardar en cache
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
    console.error('Error fetching data:', error);
    return new Response(JSON.stringify({ 
      error: 'Error al obtener datos',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};