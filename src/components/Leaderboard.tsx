import { useState, useEffect } from 'react';

interface LeaderboardEntry {
  trackId: string;
  trackName?: string;
  trackImage?: string;
  albumName?: string;
  wins: number;
  battles: number;
  winRate: number;
}

interface Props {
  artistId: string;
  artistName: string;
  limit?: number;
}

export default function Leaderboard({ artistId, artistName, limit = 10 }: Props) {
  const [tracks, setTracks] = useState<LeaderboardEntry[]>([]);
  const [allTracks, setAllTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'wins' | 'winrate'>('wins');
  const [globalStats, setGlobalStats] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [artistId, sortBy]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Obtener leaderboard
      const leaderboardResponse = await fetch(
        `/api/leaderboard/${artistId}?limit=${limit}&sort=${sortBy}`
      );
      
      if (!leaderboardResponse.ok) throw new Error('Error al cargar ranking');
      
      const leaderboardData = await leaderboardResponse.json();
      
      // Obtener info de las canciones
      const tracksResponse = await fetch(`/api/spotify/${artistId}`);
      
      if (!tracksResponse.ok) throw new Error('Error al cargar canciones');
      
      const tracksData = await tracksResponse.json();
      setAllTracks(tracksData.tracks);
      
      // Combinar datos
      const enrichedTracks = leaderboardData.tracks.map((entry: any) => {
        const trackInfo = tracksData.tracks.find((t: any) => t.id === entry.trackId);
        return {
          ...entry,
          trackName: trackInfo?.name || 'Desconocida',
          trackImage: trackInfo?.image || '',
          albumName: trackInfo?.albumName || ''
        };
      });
      
      setTracks(enrichedTracks);
      setGlobalStats(leaderboardData.globalStats);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 rounded-full" style={{ borderColor: '#A89885' }}></div>
            <div className="absolute inset-0 border-4 border-transparent rounded-full animate-spin" style={{ borderTopColor: '#926149' }}></div>
          </div>
          <p className="text-lg" style={{ color: '#44442B' }}>Cargando ranking...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-lg mb-4" style={{ color: '#926149' }}>😔 {error}</p>
        <button 
          onClick={fetchData}
          className="px-6 py-2 rounded-lg font-medium transition-all"
          style={{ backgroundColor: '#926149', color: '#F5E9E4' }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="text-6xl mb-4">🎵</div>
        <p className="text-xl mb-2" style={{ color: '#44442B', fontFamily: 'Georgia, serif' }}>
          Aún no hay rankings
        </p>
        <p style={{ color: '#A89885' }}>
          ¡Sé el primero en jugar y aparecer aquí!
        </p>
      </div>
    );
  }

  const getMedalEmoji = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-4xl font-black mb-3" style={{ color: '#44442B', fontFamily: 'Georgia, serif' }}>
          🏆 Top {limit} - {artistName}
        </h2>
        <p className="text-lg mb-6" style={{ color: '#A89885' }}>
          Las canciones más amadas por la comunidad
        </p>

        {/* Stats globales */}
        {globalStats && (
          <div className="flex justify-center gap-6 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#926149' }}>
                {globalStats.totalBattles.toLocaleString()}
              </div>
              <div className="text-sm" style={{ color: '#A89885' }}>Batallas totales</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#926149' }}>
                {globalStats.tracksWithStats}
              </div>
              <div className="text-sm" style={{ color: '#A89885' }}>Canciones votadas</div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setSortBy('wins')}
            className={`px-6 py-2 rounded-full font-medium transition-all border-2 ${
              sortBy === 'wins' 
                ? 'shadow-lg' 
                : 'opacity-60 hover:opacity-100'
            }`}
            style={{
              backgroundColor: sortBy === 'wins' ? '#926149' : 'transparent',
              color: sortBy === 'wins' ? '#F5E9E4' : '#926149',
              borderColor: '#926149'
            }}
          >
            🏆 Más Victorias
          </button>
          <button
            onClick={() => setSortBy('winrate')}
            className={`px-6 py-2 rounded-full font-medium transition-all border-2 ${
              sortBy === 'winrate' 
                ? 'shadow-lg' 
                : 'opacity-60 hover:opacity-100'
            }`}
            style={{
              backgroundColor: sortBy === 'winrate' ? '#926149' : 'transparent',
              color: sortBy === 'winrate' ? '#F5E9E4' : '#926149',
              borderColor: '#926149'
            }}
          >
            📊 Mejor Win Rate
          </button>
        </div>
      </div>

      {/* Lista de canciones */}
      <div className="space-y-3">
        {tracks.map((track, index) => (
          <div
            key={track.trackId}
            className={`
              flex items-center gap-4 p-4 rounded-xl transition-all duration-300 hover:scale-[1.02] border-2
              ${index < 3 ? 'shadow-lg' : ''}
            `}
            style={{
              backgroundColor: index < 3 ? '#ffffff' : '#F5E9E4',
              borderColor: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#D1BFA7'
            }}
          >
            {/* Posición */}
            <div className="flex-shrink-0 w-16 text-center">
              <div className={`text-3xl font-black ${index < 3 ? '' : 'text-2xl'}`}>
                {getMedalEmoji(index)}
              </div>
            </div>

            {/* Imagen */}
            {track.trackImage && (
              <div className="flex-shrink-0">
                <img 
                  src={track.trackImage} 
                  alt={track.trackName}
                  className="w-16 h-16 rounded-lg object-cover shadow-md"
                />
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg line-clamp-1 mb-1" style={{ color: '#44442B' }}>
                {track.trackName}
              </h3>
              <p className="text-sm line-clamp-1" style={{ color: '#A89885' }}>
                {track.albumName}
              </p>
            </div>

            {/* Stats */}
            <div className="flex gap-6 text-center flex-shrink-0">
              <div>
                <div className="text-xl font-black" style={{ color: '#926149' }}>
                  {track.wins}
                </div>
                <div className="text-xs" style={{ color: '#A89885' }}>victorias</div>
              </div>
              <div>
                <div className="text-xl font-black" style={{ color: '#6b6b45' }}>
                  {track.winRate}%
                </div>
                <div className="text-xs" style={{ color: '#A89885' }}>win rate</div>
              </div>
              <div>
                <div className="text-xl font-black" style={{ color: '#A89885' }}>
                  {track.battles}
                </div>
                <div className="text-xs" style={{ color: '#A89885' }}>batallas</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="text-center mt-8 pt-6 border-t-2" style={{ borderColor: '#D1BFA7' }}>
        <p className="text-sm" style={{ color: '#A89885' }}>
          💡 Las estadísticas se actualizan en tiempo real
        </p>
      </div>
    </div>
  );
}