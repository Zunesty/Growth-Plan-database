"use client";

import { useState, useRef, useCallback } from "react";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

export default function VoiceRecorder({ onTranscript, disabled }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startRecording = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = transcript;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (finalTranscript.trim()) {
        setTranscript(finalTranscript.trim());
        onTranscript(finalTranscript.trim());
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [transcript, onTranscript]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const handleClear = () => {
    setTranscript("");
    onTranscript("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled}
          className={`flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition-all disabled:opacity-50 ${
            isRecording
              ? "bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
              : "bg-zunesty-green/15 border border-zunesty-green/30 text-zunesty-green hover:bg-zunesty-green/25"
          }`}
        >
          {isRecording ? (
            <>
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              Stop Recording
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              Record Voice Dump
            </>
          )}
        </button>
        {transcript && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-zunesty-light/30 hover:text-zunesty-light/50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {transcript && (
        <div className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-4">
          <p className="text-xs font-medium text-zunesty-green/60 mb-2 uppercase tracking-wider">Transcript</p>
          <p className="text-sm text-zunesty-light/80 leading-relaxed whitespace-pre-wrap">{transcript}</p>
        </div>
      )}

      {isRecording && (
        <p className="text-xs text-zunesty-light/30 animate-pulse">
          Listening... speak your client update now.
        </p>
      )}
    </div>
  );
}
