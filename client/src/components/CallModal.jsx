import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Camera,
  ShieldCheck,
  Volume2
} from 'lucide-react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export default function CallModal({
  callData, // { isIncoming, peer, isVideo, offer }
  currentUser,
  wsClient,
  onClose
}) {
  const [callStatus, setCallStatus] = useState(callData.isIncoming ? 'incoming' : 'outgoing');
  const [isVideoCall, setIsVideoCall] = useState(!!callData.isVideo);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(!callData.isVideo);
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const pcRef = useRef(null);
  const durationTimerRef = useRef(null);
  const ringtoneTimerRef = useRef(null);

  // Play synthetic pleasant ringtone
  const playRingtone = (isOutgoing) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const ringInterval = setInterval(() => {
        if (callStatus === 'connected' || callStatus === 'ended') {
          clearInterval(ringInterval);
          return;
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isOutgoing ? 440 : 480, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      }, isOutgoing ? 2500 : 2000);

      ringtoneTimerRef.current = ringInterval;
    } catch (e) {}
  };

  useEffect(() => {
    if (callStatus === 'incoming' || callStatus === 'outgoing') {
      playRingtone(callStatus === 'outgoing');
    } else {
      clearInterval(ringtoneTimerRef.current);
    }
    return () => clearInterval(ringtoneTimerRef.current);
  }, [callStatus]);

  // Duration Timer on Connected
  useEffect(() => {
    if (callStatus === 'connected') {
      clearInterval(ringtoneTimerRef.current);
      durationTimerRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    }
    return () => clearInterval(durationTimerRef.current);
  }, [callStatus]);

  // Handle Signaling Messages from WebSocket
  useEffect(() => {
    if (!wsClient) return;

    const handleSignaling = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.caller !== callData.peer.username && data.sender !== callData.peer.username && data.target !== currentUser.username) {
          return;
        }

        if (data.type === 'CALL_ACCEPT' && pcRef.current) {
          setCallStatus('connected');
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.type === 'CALL_ICE_CANDIDATE' && pcRef.current) {
          if (data.candidate) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
          }
        } else if (data.type === 'CALL_REJECT' || data.type === 'CALL_HANGUP') {
          setCallStatus('ended');
          cleanup();
          setTimeout(onClose, 1200);
        }
      } catch (e) {
        console.error('Call signaling error:', e);
      }
    };

    wsClient.addEventListener('message', handleSignaling);
    return () => wsClient.removeEventListener('message', handleSignaling);
  }, [wsClient, callData, currentUser]);

  // Start Outgoing Call
  useEffect(() => {
    if (!callData.isIncoming) {
      initiateCall();
    }
  }, []);

  const getMediaStream = async (video) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.warn('Could not get video, falling back to audio:', err);
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = audioStream;
      setIsVideoCall(false);
      setIsCameraOff(true);
      return audioStream;
    }
  };

  const createPeerConnection = (stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({
          type: 'CALL_ICE_CANDIDATE',
          target: callData.peer.username,
          sender: currentUser.username,
          candidate: event.candidate
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setCallStatus('ended');
        cleanup();
        setTimeout(onClose, 1000);
      }
    };

    return pc;
  };

  const initiateCall = async () => {
    try {
      const stream = await getMediaStream(isVideoCall);
      const pc = createPeerConnection(stream);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({
          type: 'CALL_OFFER',
          target: callData.peer.username,
          caller: currentUser.username,
          callerDisplayName: currentUser.displayName || currentUser.username,
          callerAvatarUrl: currentUser.avatarUrl || null,
          isVideo: isVideoCall,
          offer
        }));
      }
    } catch (err) {
      console.error('Initiate call error:', err);
      setCallStatus('ended');
      setTimeout(onClose, 1000);
    }
  };

  const answerCall = async (withVideo = false) => {
    try {
      setIsVideoCall(withVideo);
      setIsCameraOff(!withVideo);
      const stream = await getMediaStream(withVideo);
      const pc = createPeerConnection(stream);

      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      setCallStatus('connected');

      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({
          type: 'CALL_ACCEPT',
          target: callData.peer.username,
          sender: currentUser.username,
          answer
        }));
      }
    } catch (err) {
      console.error('Answer call error:', err);
      rejectCall();
    }
  };

  const rejectCall = () => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(JSON.stringify({
        type: 'CALL_REJECT',
        target: callData.peer.username,
        sender: currentUser.username
      }));
    }
    setCallStatus('ended');
    cleanup();
    setTimeout(onClose, 400);
  };

  const hangUp = () => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(JSON.stringify({
        type: 'CALL_HANGUP',
        target: callData.peer.username,
        sender: currentUser.username
      }));
    }
    setCallStatus('ended');
    cleanup();
    setTimeout(onClose, 400);
  };

  const cleanup = () => {
    clearInterval(ringtoneTimerRef.current);
    clearInterval(durationTimerRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = async () => {
    if (!isVideoCall) {
      // Upgrade to video
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = stream.getVideoTracks()[0];
        if (localStreamRef.current && videoTrack && pcRef.current) {
          localStreamRef.current.addTrack(videoTrack);
          const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          } else {
            pcRef.current.addTrack(videoTrack, localStreamRef.current);
          }
          if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
          setIsVideoCall(true);
          setIsCameraOff(false);
        }
      } catch (e) {}
    } else {
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = !videoTrack.enabled;
          setIsCameraOff(!videoTrack.enabled);
        }
      }
    }
  };

  const formatTimer = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999999,
        background: 'rgba(5, 8, 18, 0.96)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '30px 20px',
        color: '#ffffff',
        animation: 'fadeIn 0.25s ease-out'
      }}
    >
      {/* Remote Video Track (Background Stream) */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: callStatus === 'connected' && isVideoCall ? 'block' : 'none',
          zIndex: 1
        }}
      />

      {/* Local Video Thumbnail (PiP) */}
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          width: '100px',
          height: '140px',
          borderRadius: '14px',
          objectFit: 'cover',
          border: '2px solid rgba(238, 120, 130, 0.6)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 10,
          display: isVideoCall && !isCameraOff ? 'block' : 'none'
        }}
      />

      {/* Top Header: Security Indicator */}
      <div style={{ zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '4px 12px', borderRadius: '16px' }}>
          <ShieldCheck size={14} />
          <span>End-to-End Encrypted Call (P2P DTLS-SRTP)</span>
        </div>
        {callStatus === 'connected' && (
          <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#f8fafc', marginTop: '6px' }}>
            {formatTimer(callDuration)}
          </span>
        )}
      </div>

      {/* Peer Profile Avatar & Status */}
      <div style={{ zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', marginTop: 'auto', marginBottom: 'auto' }}>
        {callData.peer.avatarUrl ? (
          <img
            src={callData.peer.avatarUrl}
            alt={callData.peer.username}
            style={{
              width: '110px',
              height: '110px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: `3px solid ${callData.peer.avatarColor || '#ee7882'}`,
              boxShadow: '0 0 30px rgba(238, 120, 130, 0.35)',
              animation: (callStatus === 'incoming' || callStatus === 'outgoing') ? 'pulse 1.8s infinite' : 'none'
            }}
          />
        ) : (
          <div
            style={{
              width: '110px',
              height: '110px',
              borderRadius: '50%',
              backgroundColor: callData.peer.avatarColor || '#ee7882',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.5rem',
              fontWeight: 'bold',
              boxShadow: '0 0 30px rgba(238, 120, 130, 0.35)',
              animation: (callStatus === 'incoming' || callStatus === 'outgoing') ? 'pulse 1.8s infinite' : 'none'
            }}
          >
            {callData.peer.username[0].toUpperCase()}
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '0 0 4px 0' }}>
            {callData.peer.displayName || callData.peer.username}
          </h2>
          <span style={{ fontSize: '0.88rem', color: '#94a3b8' }}>
            {callStatus === 'incoming' && 'Incoming Encrypted Call...'}
            {callStatus === 'outgoing' && 'Ringing...'}
            {callStatus === 'connected' && (isVideoCall ? 'Connected (Video Call)' : 'Connected (Voice Call)')}
            {callStatus === 'ended' && 'Call Ended'}
          </span>
        </div>
      </div>

      {/* Bottom Controls */}
      <div style={{ zIndex: 10, width: '100%', maxWidth: '380px', display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '16px' }}>
        {callStatus === 'incoming' ? (
          <>
            {/* Decline */}
            <button
              type="button"
              onClick={rejectCall}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#ef4444',
                border: 'none',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(239, 68, 68, 0.5)'
              }}
              title="Decline Call"
            >
              <PhoneOff size={24} />
            </button>

            {/* Answer Voice */}
            <button
              type="button"
              onClick={() => answerCall(false)}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#10b981',
                border: 'none',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.5)'
              }}
              title="Answer Voice"
            >
              <Phone size={24} />
            </button>

            {/* Answer Video (if caller requested video) */}
            {callData.isVideo && (
              <button
                type="button"
                onClick={() => answerCall(true)}
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: '#3b82f6',
                  border: 'none',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(59, 130, 246, 0.5)'
                }}
                title="Answer Video"
              >
                <Video size={24} />
              </button>
            )}
          </>
        ) : (
          <>
            {/* Mute Mic Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: isMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            {/* End Call */}
            <button
              type="button"
              onClick={hangUp}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#ef4444',
                border: 'none',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.6)'
              }}
              title="Hang Up"
            >
              <PhoneOff size={28} />
            </button>

            {/* Toggle Video */}
            <button
              type="button"
              onClick={toggleCamera}
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: isCameraOff ? 'rgba(255, 255, 255, 0.15)' : '#3b82f6',
                border: 'none',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title={isCameraOff ? 'Turn Video On' : 'Turn Video Off'}
            >
              {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
