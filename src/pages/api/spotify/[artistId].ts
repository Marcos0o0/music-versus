import type { APIRoute } from 'astro';
import { kv } from '@vercel/kv';

export const prerender = false; // Esto lo hace serverless

// Mapeo de IDs legibles a IDs de Spotify
const ARTIST_MAP: Record<string, string> = {
  'bts': '3Nrfpe0tUJi4K4DXYWgMUX'
};

export const GET: APIRoute = async ({ params }) => {
  const artistId = params.artistId;
  
  if (!artistId || !ARTIST_MAP[artistId]) {
    return new Response(JSON.stringify({ error: 'Artista no encontrado' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const spotifyArtistId = ARTIST_MAP[artistId];
  const cacheKey = `tracks:${artistId}`;

  try {
    // Intentar obtener del cache
    const cached = await kv.get(cacheKey);
    if (cached) {
      console.log('Cache hit para:', artistId);
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener token de Spotify
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          `${import.meta.env.SPOTIFY_CLIENT_ID}:${import.meta.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });

    const { access_token } = await tokenResponse.json();

    // Obtener álbumes del artista
    const albumsResponse = await fetch(
      `https://api.spotify.com/v1/artists/${spotifyArtistId}/albums?include_groups=album,single&market=US&limit=50`,
      {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }
    );

    const albumsData = await albumsResponse.json();
    
    // Obtener tracks de todos los álbumes
    const trackPromises = albumsData.items.map((album: any) =>
      fetch(`https://api.spotify.com/v1/albums/${album.id}/tracks`, {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }).then(res => res.json())
    );

    const tracksData = await Promise.all(trackPromises);
    
    // Combinar y limpiar datos
    const allTracks = tracksData.flatMap((data, idx) => 
      data.items.map((track: any) => ({
        id: track.id,
        name: track.name,
        image: albumsData.items[idx].images[0]?.url || '',
        albumName: albumsData.items[idx].name,
        previewUrl: track.preview_url
      }))
    );

    // Remover duplicados por nombre
    const uniqueTracks = Array.from(
      new Map(allTracks.map(track => [track.name.toLowerCase(), track])).values()
    );

    const result = {
      artist: artistId,
      tracks: uniqueTracks,
      total: uniqueTracks.length
    };

    // Guardar en cache por 24 horas
    await kv.set(cacheKey, result, { ex: 86400 });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching Spotify data:', error);
    return new Response(JSON.stringify({ error: 'Error al obtener datos de Spotify' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};