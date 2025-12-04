import type { APIRoute } from 'astro';
import { kv } from '@vercel/kv';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { winnerId, loserId, artistId } = await request.json();

    if (!winnerId || !loserId || !artistId) {
      return new Response(JSON.stringify({ error: 'Datos incompletos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Incrementar contador del ganador
    const winnerKey = `stats:${artistId}:${winnerId}`;
    const loserKey = `stats:${artistId}:${loserId}`;

    await Promise.all([
      kv.hincrby(winnerKey, 'wins', 1),
      kv.hincrby(winnerKey, 'battles', 1),
      kv.hincrby(loserKey, 'battles', 1)
    ]);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error saving vote:', error);
    return new Response(JSON.stringify({ error: 'Error al guardar voto' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const GET: APIRoute = async ({ url }) => {
  try {
    const artistId = url.searchParams.get('artistId');
    const trackId = url.searchParams.get('trackId');

    if (!artistId || !trackId) {
      return new Response(JSON.stringify({ error: 'Parámetros faltantes' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const statsKey = `stats:${artistId}:${trackId}`;
    const stats = await kv.hgetall(statsKey);

    return new Response(JSON.stringify(stats || { wins: 0, battles: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    return new Response(JSON.stringify({ error: 'Error al obtener estadísticas' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};