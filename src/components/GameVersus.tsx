import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

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
  const [animating, setAnimating] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [rejectedTrack, setRejectedTrack] = useState<string | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const winnerCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTracks();
  }, [artistId]);

  // Limpiar audio al desmontar
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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

  // Manejar preview de audio
  const handleMouseEnter = (track: Track) => {
    if (animating || !track.previewUrl) return;
    
    setHoveredTrack(track.id);
    
    // Detener audio anterior si existe
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    // Crear y reproducir nuevo audio
    try {
      audioRef.current = new Audio(track.previewUrl);
      audioRef.current.volume = 0.3;
      
      // Listener cuando empiece a reproducir
      audioRef.current.addEventListener('playing', () => {
        setPlayingAudio(track.id);
      });
      
      // Listener cuando termine o haya error
      audioRef.current.addEventListener('ended', () => {
        setPlayingAudio(null);
      });
      
      audioRef.current.addEventListener('error', () => {
        setPlayingAudio(null);
        console.log('Error al cargar audio');
      });
      
      // Intentar reproducir
      const playPromise = audioRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.log('Audio autoplay blocked:', err.message);
        });
      }
    } catch (err) {
      console.log('Audio creation failed:', err);
    }
  };

  const handleMouseLeave = () => {
    setHoveredTrack(null);
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    
    setPlayingAudio(null);
  };

  // Toggle manual de audio
  const toggleAudio = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation(); // No activar el voto
    
    if (!track.previewUrl) return;
    
    // Si ya está reproduciendo este track, pausar
    if (playingAudio === track.id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlayingAudio(null);
      return;
    }
    
    // Detener audio anterior
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    // Reproducir nuevo audio
    try {
      audioRef.current = new Audio(track.previewUrl);
      audioRef.current.volume = 0.3;
      
      audioRef.current.addEventListener('playing', () => {
        setPlayingAudio(track.id);
      });
      
      audioRef.current.addEventListener('ended', () => {
        setPlayingAudio(null);
      });
      
      audioRef.current.play().catch(err => {
        console.error('Error playing audio:', err);
        setPlayingAudio(null);
      });
    } catch (err) {
      console.error('Error creating audio:', err);
    }
  };

  // Lanzar confetti
  const launchConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 999 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
    }, 250);
  };

  // Generar imagen para compartir
  const generateShareImage = async () => {
    if (!winner || !winnerCardRef.current) return;
    
    setGeneratingImage(true);
    
    try {
      // Importar html2canvas dinámicamente
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(winnerCardRef.current, {
        backgroundColor: '#0a0a0f',
        scale: 2,
        logging: false,
      });
      
      // Convertir a blob y descargar
      canvas.toBlob((blob) => {
        if (!blob) return;
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${winner.name.replace(/[^a-z0-9]/gi, '_')}_music_versus.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        
        setGeneratingImage(false);
      });
    } catch (err) {
      console.error('Error generating image:', err);
      alert('Error al generar imagen. Intenta de nuevo.');
      setGeneratingImage(false);
    }
  };

  const handleVote = async (winnerTrack: Track) => {
    if (!currentPair || animating) return;

    // Detener audio si está reproduciéndose
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setAnimating(true);
    setSelectedTrack(winnerTrack.id);
    
    const loserTrack = currentPair[0].id === winnerTrack.id ? currentPair[1] : currentPair[0];
    setRejectedTrack(loserTrack.id);

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

    // Esperar animación
    await new Promise(resolve => setTimeout(resolve, 800));

    // Si no quedan más canciones, tenemos un ganador
    if (remainingTracks.length === 0) {
      setWinner(winnerTrack);
      await fetchStats(winnerTrack.id);
      
      // Lanzar confetti después de un pequeño delay
      setTimeout(() => launchConfetti(), 300);
      
      setAnimating(false);
      return;
    }

    // Siguiente batalla
    const nextTrack = remainingTracks[0];
    setCurrentPair([winnerTrack, nextTrack]);
    setRemainingTracks(remainingTracks.slice(1));
    
    // Reset animación
    setSelectedTrack(null);
    setRejectedTrack(null);
    setAnimating(false);
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
    setSelectedTrack(null);
    setRejectedTrack(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-purple-500/30 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-purple-500 rounded-full animate-spin"></div>
          </div>
          <p className="text-2xl font-bold text-gray-100 mb-2">Cargando canciones</p>
          <p className="text-gray-400">Preparando batalla de {artistName}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center bg-red-500/10 border border-red-500/50 rounded-xl p-8 max-w-md">
          <div className="text-6xl mb-4">😔</div>
          <p className="text-xl text-red-400 mb-4 font-bold">¡Ups! Algo salió mal</p>
          <p className="text-gray-300 mb-6">{error}</p>
          <button 
            onClick={fetchTracks}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition-all transform hover:scale-105 font-bold"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (winner) {
    const trackStats = stats[winner.id];
    const winRate = trackStats && trackStats.battles > 0 ? 
      ((trackStats.wins / trackStats.battles) * 100).toFixed(1) : '0.0';
    const totalBattles = trackStats?.battles || 0;
    const totalWins = trackStats?.wins || 0;
    const lossRate = trackStats && trackStats.battles > 0 ?
      (100 - parseFloat(winRate)).toFixed(1) : '0.0';

    return (
      <div className="max-w-3xl mx-auto animate-[fadeIn_0.5s_ease-out]">
        {/* Card para captura */}
        <div ref={winnerCardRef} className="bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-8 rounded-2xl">
          {/* Confetti effect */}
          <div className="text-center mb-8">
            <div className="inline-block animate-[bounce_1s_ease-in-out_3]">
              <div className="text-8xl mb-4">🏆</div>
            </div>
            <h2 className="text-5xl font-black mb-3 bg-gradient-to-r from-yellow-300 via-yellow-400 to-orange-500 bg-clip-text text-transparent animate-[pulse_2s_ease-in-out_infinite]">
              ¡Canción Ganadora!
            </h2>
            <p className="text-xl text-gray-400">Tu favorita de {artistName}</p>
          </div>
          
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl rounded-2xl overflow-hidden border-2 border-yellow-500/50 shadow-2xl shadow-yellow-500/20">
            {/* Imagen del ganador */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent z-10"></div>
              <img 
                src={winner.image} 
                alt={winner.name}
                className="w-full h-80 object-cover"
              />
              <div className="absolute top-4 right-4 bg-yellow-500 text-gray-900 px-4 py-2 rounded-full font-black text-sm z-20 animate-[pulse_2s_ease-in-out_infinite]">
                #1 FAVORITA
              </div>
            </div>
            
            <div className="p-8">
              <h3 className="text-4xl font-black mb-2 text-white">{winner.name}</h3>
              <p className="text-lg text-gray-400 mb-8">{winner.albumName}</p>
              
              {/* Estadísticas mejoradas */}
              {trackStats && totalBattles > 0 ? (
                <div className="space-y-6 mb-8">
                  <div className="text-center mb-6">
                    <p className="text-sm text-gray-400 mb-3 font-medium">RENDIMIENTO GLOBAL</p>
                    <div className="flex justify-center items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <svg 
                          key={i}
                          className={`w-8 h-8 ${i < Math.round(parseFloat(winRate) / 20) ? 'text-yellow-400' : 'text-gray-600'}`}
                          fill="currentColor" 
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                  </div>

                  {/* Grid de estadísticas */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-xl p-4 text-center">
                      <div className="text-3xl font-black text-purple-300 mb-1">{totalWins}</div>
                      <div className="text-xs text-gray-400 font-medium">VICTORIAS</div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-pink-500/20 to-pink-600/20 border border-pink-500/30 rounded-xl p-4 text-center">
                      <div className="text-3xl font-black text-pink-300 mb-1">{totalBattles}</div>
                      <div className="text-xs text-gray-400 font-medium">BATALLAS</div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl p-4 text-center">
                      <div className="text-3xl font-black text-yellow-300 mb-1">{winRate}%</div>
                      <div className="text-xs text-gray-400 font-medium">WIN RATE</div>
                    </div>
                  </div>

                  {/* Barra de progreso win/loss */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-green-400">Victorias {winRate}%</span>
                      <span className="text-red-400">Derrotas {lossRate}%</span>
                    </div>
                    <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden flex">
                      <div 
                        className="bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-1000"
                        style={{ width: `${winRate}%` }}
                      />
                      <div 
                        className="bg-gradient-to-r from-red-500 to-rose-400 transition-all duration-1000"
                        style={{ width: `${lossRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Mensaje motivacional basado en win rate */}
                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                    <p className="text-center text-sm text-gray-300">
                      {parseFloat(winRate) >= 80 && "🔥 ¡Dominación absoluta! Esta canción es imbatible"}
                      {parseFloat(winRate) >= 60 && parseFloat(winRate) < 80 && "⭐ Gran elección, esta canción es muy popular"}
                      {parseFloat(winRate) >= 40 && parseFloat(winRate) < 60 && "💪 Buena canción, tiene sus fans leales"}
                      {parseFloat(winRate) < 40 && "💎 ¡Una joya oculta! Tienes gustos únicos"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 mb-8 text-center">
                  <p className="text-gray-400">¡Eres el primero en elegir esta canción! 🎉</p>
                </div>
              )}
            </div>
          </div>

          {/* Watermark para la imagen compartida */}
          <div className="text-center mt-4">
            <p className="text-gray-500 text-sm">Music Versus • Encuentra tu canción favorita</p>
          </div>
        </div>
        
        {/* Botones de acción (fuera del ref para que no aparezcan en la captura) */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button 
            onClick={resetGame}
            className="flex-1 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-lg shadow-purple-500/50"
          >
            🎮 Jugar de nuevo
          </button>
          
          <button 
            onClick={generateShareImage}
            disabled={generatingImage}
            className="flex-1 px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingImage ? '⏳ Generando...' : '📸 Descargar imagen'}
          </button>
          
          <button 
            onClick={() => {
              const text = `¡Mi canción favorita de ${artistName} es "${winner.name}"! 🎵`;
              const url = window.location.href;
              if (navigator.share) {
                navigator.share({ title: 'Music Versus', text, url });
              } else {
                navigator.clipboard.writeText(`${text}\n${url}`);
                alert('¡Copiado al portapapeles!');
              }
            }}
            className="flex-1 px-8 py-4 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-lg"
          >
            📤 Compartir
          </button>
        </div>
      </div>
    );
  }

  if (!currentPair) return null;

  const progress = ((tracks.length - remainingTracks.length - 1) / tracks.length) * 100;
  const battlesLeft = remainingTracks.length + 1;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Progress mejorado */}
      <div className="mb-12">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <div className="text-2xl">⚔️</div>
            <div>
              <p className="text-sm font-medium text-gray-400">Batallas</p>
              <p className="text-xl font-black text-white">{tracks.length - remainingTracks.length - 1} / {tracks.length}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-400">Quedan</p>
            <p className="text-xl font-black text-purple-400">{battlesLeft} {battlesLeft === 1 ? 'canción' : 'canciones'}</p>
          </div>
        </div>
        <div className="w-full h-4 bg-gray-800 rounded-full overflow-hidden border border-gray-700 shadow-inner">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 transition-all duration-500 relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Header con animación */}
      <div className="text-center mb-12 animate-[fadeIn_0.5s_ease-out]">
        <h2 className="text-4xl md:text-5xl font-black mb-3 bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
          ¿Cuál prefieres?
        </h2>
        <p className="text-gray-400 text-lg">
          {currentPair.some(t => t.previewUrl) 
            ? '🎧 Click en "Preview" para escuchar • Pasa el cursor en desktop' 
            : 'Elige tu favorita para continuar'}
        </p>
      </div>

      {/* VS Badge */}
      <div className="flex justify-center mb-8 relative z-20">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-3 rounded-full font-black text-2xl shadow-2xl border-4 border-gray-900 animate-pulse">
          VS
        </div>
      </div>

      {/* Cards con animaciones */}
      <div className="grid md:grid-cols-2 gap-6 md:gap-8 relative">
        {currentPair.map((track, index) => {
          const isSelected = selectedTrack === track.id;
          const isRejected = rejectedTrack === track.id;
          const isHovered = hoveredTrack === track.id;
          const isPlaying = playingAudio === track.id;
          const hasPreview = !!track.previewUrl;
          
          return (
            <button
              key={track.id}
              onClick={() => handleVote(track)}
              onMouseEnter={() => handleMouseEnter(track)}
              onMouseLeave={handleMouseLeave}
              disabled={animating}
              className={`
                group relative rounded-2xl overflow-hidden border-4 transition-all duration-500
                ${isSelected ? 'border-green-500 scale-105 shadow-2xl shadow-green-500/50' : ''}
                ${isRejected ? 'border-red-500 opacity-50 scale-95' : ''}
                ${!isSelected && !isRejected ? 'border-gray-700 hover:border-purple-500 hover:scale-[1.02] shadow-xl' : ''}
                ${animating ? 'cursor-not-allowed' : 'cursor-pointer'}
              `}
              style={{
                transform: isRejected ? 'translateY(20px)' : '',
                transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}
            >
              {/* Indicador de audio */}
              {hasPreview && isPlaying && !animating && (
                <div className="absolute top-4 right-4 z-30 bg-green-600 text-white px-3 py-2 rounded-full text-xs font-bold flex items-center gap-2 animate-[fadeIn_0.3s_ease-out]">
                  <div className="flex gap-0.5">
                    <div className="w-1 h-3 bg-white rounded-full animate-[bounce_0.6s_ease-in-out_infinite]"></div>
                    <div className="w-1 h-3 bg-white rounded-full animate-[bounce_0.6s_ease-in-out_0.1s_infinite]"></div>
                    <div className="w-1 h-3 bg-white rounded-full animate-[bounce_0.6s_ease-in-out_0.2s_infinite]"></div>
                  </div>
                  REPRODUCIENDO
                </div>
              )}

              {/* Overlay de selección */}
              {isSelected && (
                <div className="absolute inset-0 bg-green-500/20 z-30 flex items-center justify-center animate-[fadeIn_0.3s_ease-out]">
                  <div className="bg-green-500 rounded-full p-6 animate-[bounce_0.5s_ease-out]">
                    <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Overlay de rechazo */}
              {isRejected && (
                <div className="absolute inset-0 bg-red-500/20 z-30 flex items-center justify-center animate-[fadeIn_0.3s_ease-out]">
                  <div className="bg-red-500 rounded-full p-6">
                    <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Imagen */}
              <div className="aspect-square overflow-hidden bg-gray-900 relative">
                <img 
                  src={track.image} 
                  alt={track.name}
                  className={`
                    w-full h-full object-cover transition-transform duration-700
                    ${!animating ? 'group-hover:scale-110' : ''}
                  `}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-60 pointer-events-none"></div>
                
                {/* Número de batalla */}
                <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-bold z-10">
                  #{index + 1}
                </div>

                {/* BOTÓN DE AUDIO - SIEMPRE VISIBLE */}
                {!animating && (
                  <div className="absolute bottom-4 left-4 z-40">
                    {hasPreview ? (
                      <button
                        onClick={(e) => toggleAudio(e, track)}
                        className="bg-purple-600 hover:bg-purple-700 backdrop-blur-sm px-4 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all transform hover:scale-110 shadow-2xl border-2 border-purple-400"
                      >
                        {isPlaying ? (
                          <>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span>Pausar</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                            <span>Preview</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="bg-gray-700/90 backdrop-blur-sm px-4 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-2xl border-2 border-gray-600 opacity-60">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                        </svg>
                        <span>Sin preview</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Info */}
              <div className="p-6 bg-gradient-to-b from-gray-800/95 to-gray-900/95 backdrop-blur-sm">
                <h3 className={`
                  text-xl font-bold mb-2 transition-colors line-clamp-2
                  ${!animating ? 'group-hover:text-purple-400' : ''}
                `}>
                  {track.name}
                </h3>
                <p className="text-sm text-gray-400 line-clamp-1 mb-4">
                  {track.albumName}
                </p>
                
                {/* Botón de selección */}
                <div className={`
                  flex items-center justify-center gap-2 py-2 px-4 rounded-lg transition-all
                  ${!animating ? 'bg-purple-600/20 group-hover:bg-purple-600 border border-purple-500/50' : 'bg-gray-700'}
                `}>
                  <span className="font-bold">Elegir esta</span>
                  <svg className={`w-5 h-5 transition-transform ${!animating ? 'group-hover:translate-x-1' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>

              {/* Glow effect on hover */}
              {!animating && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                  <div className="absolute inset-0 bg-purple-500/10 blur-xl"></div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Tips */}
      <div className="mt-12 text-center">
        <p className="text-gray-500 text-sm">💡 Consejo: Elige con el corazón, no con la mente</p>
      </div>
    </div>
  );
}