import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, RotateCcw, Volume2 } from 'lucide-react';

export default function VoiceWaveformPlayer({
  src,
  duration = 0,
  isMine = false
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Generate deterministic decorative waveform bars
  const bars = useMemo(() => {
    const count = 28;
    const heights = [];
    let seed = 42;
    for (let i = 0; i < count; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const rnd = seed / 233280;
      // create natural-looking voice waveform pattern (taller in middle)
      const centerFactor = Math.sin((i / count) * Math.PI);
      const h = Math.max(15, Math.floor((rnd * 0.7 + centerFactor * 0.5) * 100));
      heights.push(h);
    }
    return heights;
  }, []);

  // Update audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (index) => {
    const audio = audioRef.current;
    if (!audio || !totalDuration) return;
    const pct = index / bars.length;
    const newTime = pct * totalDuration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    audio.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div
      className={`voice-note-player ${isMine ? 'mine' : 'peer'}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 4px',
        minWidth: '220px',
        maxWidth: '300px',
        userSelect: 'none'
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          border: 'none',
          background: isMine ? '#ffffff' : '#ee7882',
          color: isMine ? '#ee7882' : '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          transition: 'transform 0.15s ease'
        }}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: '2px' }} />}
      </button>

      {/* Waveform & Time Track */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* Bars Container */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            height: '24px',
            cursor: 'pointer'
          }}
        >
          {bars.map((h, idx) => {
            const barPct = (idx / bars.length) * 100;
            const isFilled = barPct <= progressPercent;

            return (
              <div
                key={idx}
                onClick={() => handleSeek(idx)}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  minHeight: '4px',
                  borderRadius: '2px',
                  backgroundColor: isFilled
                    ? (isMine ? '#ffffff' : '#ee7882')
                    : (isMine ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.2)'),
                  transition: 'background-color 0.1s ease, height 0.2s ease'
                }}
              />
            );
          })}
        </div>

        {/* Time & Speed Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.68rem',
            color: isMine ? 'rgba(255, 255, 255, 0.9)' : '#94a3b8'
          }}
        >
          <span>{isPlaying ? formatTime(currentTime) : formatTime(totalDuration)}</span>

          <button
            type="button"
            onClick={cycleSpeed}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              borderRadius: '4px',
              padding: '1px 5px',
              fontSize: '0.65rem',
              fontWeight: 'bold',
              color: isMine ? '#ffffff' : '#cbd5e1',
              cursor: 'pointer'
            }}
            title="Playback Speed"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}
