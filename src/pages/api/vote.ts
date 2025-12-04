import type { APIRoute } from 'astro';
import { createClient } from 'redis';

export const prerender = false;

async function getRedisClient() {
  const client = createClient({
    url: import.meta.env.REDIS_URL
  });
  await client.connect();
  return client;
}

export const POST: APIRoute = async ({ request }) => {
  let redis;
  
  try {
    const { winnerId, loserId, artistId } = await request.json();

    if (!winnerId || !loserId || !artistId) {
      return new Response(JSON.stringify({ error: 'Datos incompletos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    redis = await getRedisClient();

    const winnerKey = `stats:${artistId}:${winnerId}`;
    const loserKey = `stats:${artistId}:${loserId}`;

    // Incrementar contadores
    await Promise.all([
      redis.hIncrBy(winnerKey, 'wins', 1),
      redis.hIncrBy(winnerKey, 'battles', 1),
      redis.hIncrBy(loserKey, 'battles', 1)
    ]);

    await redis.quit();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    if (redis) await redis.quit().catch(() => {});
    console.error('Error saving vote:', error);
    return new Response(JSON.stringify({ error: 'Error al guardar voto' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const GET: APIRoute = async ({ url }) => {
  let redis;
  
  try {
    const artistId = url.searchParams.get('artistId');
    const trackId = url.searchParams.get('trackId');

    if (!artistId || !trackId) {
      return new Response(JSON.stringify({ error: 'Parámetros faltantes' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    redis = await getRedisClient();
    const statsKey = `stats:${artistId}:${trackId}`;
    const stats = await redis.hGetAll(statsKey);

    await redis.quit();

    // Convertir strings a números
    const parsedStats = stats && Object.keys(stats).length > 0 ? {
      wins: parseInt(stats.wins || '0'),
      battles: parseInt(stats.battles || '0')
    } : { wins: 0, battles: 0 };

    return new Response(JSON.stringify(parsedStats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    if (redis) await redis.quit().catch(() => {});
    console.error('Error fetching stats:', error);
    return new Response(JSON.stringify({ error: 'Error al obtener estadísticas' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};