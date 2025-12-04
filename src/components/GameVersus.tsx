import { useState, useEffect } from 'react';

interface Track {
  id: string;
  name: string;
  image: string;
  albumName: string;
  previewUrl?: string;
}

interface Props {
  artistId: string;
  artistName: string;
}

export default function GameVersus({ artistId, artistName }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentPair, setCurrentPair] = useState<[Track, Track] | null>(null);
  const [remainingTracks, setRemainingTracks] = useState<Track[]>([]);
  const [winner, setWinner] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, { wins: number; battles: number }>>({});

  // Cargar canciones al montar
  useEffect(() => {
    fetchTracks();
  }, [artistId]);

  const fetchTracks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/spotify/${artistId}`);
      
      if (!response.ok) throw new Error('Error al cargar canciones');
      
      const data = await response.json();
      const shuffled = [...data.tracks].sort(() => Math.random() - 0.5);
      
      setTracks(shuffled);
      setRemainingTracks(shuffled.slice(2));
      setCurrentPair([shuffled[0], shuffled[1]]);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setLoading(false);
    }
  };

  const handleVote = async (winnerTrack: Track) => {
    if (!currentPair) return;

    const loserTrack = currentPair[0].id === winnerTrack.id ? currentPair[1] : currentPair[0];

    // Guardar voto
    try {
      await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winnerId: winnerTrack.id,
          loserId: loserTrack.id,
          artistId
        })
      });
    } catch (err) {
      console.error('Error al guardar voto:', err);
    }

    // Si no quedan más canciones, tenemos un ganador
    if (remainingTracks.length === 0) {
      setWinner(winnerTrack);
      fetchStats(winnerTrack.id);
      return;
    }

    // Siguiente batalla: ganador vs siguiente canción
    const nextTrack = remainingTracks[0];
    setCurrentPair([winnerTrack, nextTrack]);
    setRemainingTracks(remainingTracks.slice(1));
  };

  const fetchStats = async (trackId: string) => {
    try {
      const response = await fetch(`/api/vote?artistId=${artistId}&trackId=${trackId}`);
      const data = await response.json();
      setStats({ [trackId]: data });
    } catch (err) {
      console.error('Error al obtener estadísticas:', err);
    }
  };

  const resetGame = () => {
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    setRemainingTracks(shuffled.slice(2));
    setCurrentPair([shuffled[0], shuffled[1]]);
    setWinner(null);
    setStats({});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl text-gray-300">Cargando canciones de {artistName}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-xl text-red-400 mb-4">❌ {error}</p>
          <button 
            onClick={fetchTracks}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (winner) {
    const trackStats = stats[winner.id];
    const winRate = trackStats ? 
      ((trackStats.wins / trackStats.battles) * 100).toFixed(1) : '0';

    return (
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
          🏆 ¡Canción Favorita!
        </h2>
        
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-yellow-500/30">
          <img 
            src={winner.image} 
            alt={winner.name}
            className="w-64 h-64 mx-auto rounded-lg shadow-2xl mb-6"
          />
          <h3 className="text-3xl font-bold mb-2">{winner.name}</h3>
          <p className="text-gray-400 mb-6">{winner.albumName}</p>
          
          {trackStats && (
            <div className="bg-gray-900/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-400 mb-2">Estadísticas Globales</p>
              <div className="flex justify-center gap-8">
                <div>
                  <p className="text-2xl font-bold text-purple-400">{trackStats.wins}</p>
                  <p className="text-sm text-gray-400">Victorias</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-pink-400">{winRate}%</p>
                  <p className="text-sm text-gray-400">Win Rate</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex gap-4 justify-center">
            <button 
              onClick={resetGame}
              className="px-8 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
            >
              Jugar de nuevo
            </button>
            <button 
              onClick={() => {
                const url = window.location.href;
                navigator.clipboard.writeText(url);
                alert('¡Enlace copiado!');
              }}
              className="px-8 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Compartir
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentPair) return null;

  const progress = ((tracks.length - remainingTracks.length - 1) / tracks.length) * 100;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-gray-400 mb-2">
          <span>Progreso</span>
          <span>{tracks.length - remainingTracks.length - 1} / {tracks.length} batallas</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Header */}
      <h2 className="text-3xl font-bold text-center mb-8">
        ¿Cuál prefieres?
      </h2>

      {/* Versus Cards */}
      <div className="grid md:grid-cols-2 gap-8">
        {currentPair.map((track) => (
          <button
            key={track.id}
            onClick={() => handleVote(track)}
            className="group relative bg-gray-800/50 backdrop-blur-sm rounded-xl overflow-hidden border-2 border-gray-700 hover:border-purple-500 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/30"
          >
            <div className="aspect-square overflow-hidden">
              <img 
                src={track.image} 
                alt={track.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            
            <div className="p-6">
              <h3 className="text-xl font-bold mb-2 group-hover:text-purple-400 transition-colors">
                {track.name}
              </h3>
              <p className="text-sm text-gray-400">
                {track.albumName}
              </p>
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-purple-600/0 group-hover:bg-purple-600/10 transition-colors pointer-events-none" />
          </button>
        ))}
      </div>
    </div>
  );
}