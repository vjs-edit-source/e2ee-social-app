import React, { useState, useEffect, useRef } from 'react';
import { Mic, Trash2, Send, StopCircle } from 'lucide-react';

export default function VoiceNoteRecorder({ onSend, onCancel }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    startRecording();
    return () => {
      stopStreams();
      clearInterval(timerRef.current);
    };
  }, []);

  const stopStreams = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
        else mimeType = '';
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
      setRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Could not access microphone. Please ensure microphone permissions are granted.');
      if (onCancel) onCancel();
    }
  };

  const handleCancel = () => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopStreams();
    audioChunksRef.current = [];
    if (onCancel) onCancel();
  };

  const handleFinishAndSend = () => {
    clearInterval(timerRef.current);
    const duration = seconds;
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === 'inactive') {
      stopStreams();
      if (onCancel) onCancel();
      return;
    }

    recorder.onstop = () => {
      stopStreams();
      const mime = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mime });
      if (audioBlob.size > 0 && onSend) {
        onSend(audioBlob, duration);
      } else {
        if (onCancel) onCancel();
      }
    };

    recorder.stop();
  };

  const formatTimer = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '6px 12px',
        background: 'rgba(238, 120, 130, 0.12)',
        border: '1px solid rgba(238, 120, 130, 0.35)',
        borderRadius: '24px',
        animation: 'fadeIn 0.2s ease-out',
        gap: '10px'
      }}
    >
      {/* Recording Pulse & Time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            boxShadow: '0 0 8px #ef4444',
            animation: 'pulse 1s infinite'
          }}
        />
        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
          {formatTimer(seconds)}
        </span>
        <span style={{ fontSize: '0.72rem', color: '#ee7882', opacity: 0.8 }}>
          Recording Voice Note...
        </span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Cancel Button */}
        <button
          type="button"
          onClick={handleCancel}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
          title="Cancel Recording"
        >
          <Trash2 size={15} />
        </button>

        {/* Send Button */}
        <button
          type="button"
          onClick={handleFinishAndSend}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: '#ee7882',
            border: 'none',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(238, 120, 130, 0.5)'
          }}
          title="Send Voice Note"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
