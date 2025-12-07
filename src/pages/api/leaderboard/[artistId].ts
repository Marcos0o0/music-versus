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

export const GET: APIRoute = async ({ params, url }) => {
  const artistId = params.artistId;
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const sortBy = url.searchParams.get('sort') || 'wins'; // 'wins' o 'winrate'
  
  if (!artistId) {
    return new Response(JSON.stringify({ error: 'Artist ID requerido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let redis;
  
  try {
    redis = await getRedisClient();
    
    // Obtener todas las keys de estadísticas para este artista
    const pattern = `stats:${artistId}:*`;
    const keys = await redis.keys(pattern);
    
    if (keys.length === 0) {
      await redis.quit();
      return new Response(JSON.stringify({ 
        artist: artistId, 
        tracks: [],
        total: 0 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener estadísticas de todas las canciones
    const statsPromises = keys.map(async (key) => {
      const trackId = key.split(':')[2];
      const stats = await redis!.hGetAll(key);
      
      const wins = parseInt(stats.wins || '0');
      const battles = parseInt(stats.battles || '0');
      const winRate = battles > 0 ? (wins / battles) * 100 : 0;
      
      return {
        trackId,
        wins,
        battles,
        winRate: parseFloat(winRate.toFixed(2))
      };
    });

    const allStats = await Promise.all(statsPromises);
    
    // Ordenar según el criterio
    const sorted = allStats.sort((a, b) => {
      if (sortBy === 'winrate') {
        // Priorizar canciones con más batallas en caso de empate
        if (Math.abs(b.winRate - a.winRate) < 0.1) {
          return b.battles - a.battles;
        }
        return b.winRate - a.winRate;
      }
      // Por defecto, ordenar por victorias
      return b.wins - a.wins;
    });

    // Limitar resultados
    const topTracks = sorted.slice(0, limit);
    
    // Calcular estadísticas globales
    const totalBattles = allStats.reduce((sum, s) => sum + s.battles, 0);
    const totalWins = allStats.reduce((sum, s) => sum + s.wins, 0);
    
    await redis.quit();

    return new Response(JSON.stringify({
      artist: artistId,
      tracks: topTracks,
      total: allStats.length,
      globalStats: {
        totalBattles,
        totalWins,
        tracksWithStats: allStats.length
      },
      sortedBy: sortBy
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    if (redis) await redis.quit().catch(() => {});
    console.error('Error fetching leaderboard:', error);
    return new Response(JSON.stringify({ 
      error: 'Error al obtener ranking',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};