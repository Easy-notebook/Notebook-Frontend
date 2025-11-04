import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const TypingTitle: React.FC = () => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [isTypingDone, setIsTypingDone] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const typingSpeed = 35;
  const deletingSpeed = 20;

  const startTyping = useCallback((fullText: string) => {
    setIsDeleting(false);
    let index = 0;
    const interval = window.setInterval(() => {
      setText(fullText.slice(0, index + 1));
      index++;
      if (index === fullText.length) {
        window.clearInterval(interval);
        setIsTypingDone(true);
        setTimeout(() => setShowCursor(false), 2000);
      }
    }, typingSpeed);
    return () => window.clearInterval(interval);
  }, []);

  const deleteText = useCallback((onComplete: () => void) => {
    setIsDeleting(true);
    setIsTypingDone(false);
    setShowCursor(true);
    let index = text.length;
    const interval = window.setInterval(() => {
      setText(prev => prev.slice(0, index - 1));
      index--;
      if (index === 0) {
        window.clearInterval(interval);
        onComplete();
      }
    }, deletingSpeed);
    return () => window.clearInterval(interval);
  }, [text.length]);

  const changeText = useCallback((newText: string) => {
    deleteText(() => {
      startTyping(newText);
    });
  }, [deleteText, startTyping]);

  useEffect(() => {
    const cleanup = startTyping(t('emptyState.title'));
    return () => cleanup();
  }, [startTyping, t]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.changeTypingText = changeText;
      return () => { delete window.changeTypingText; };
    }
    return;
  }, [changeText]);

  return (
    <div className="relative">
      <style>{`
        @keyframes typing-cursor {
          0%, 100% { transform: scaleY(1) scaleX(1); opacity: 0.9; }
          50% { transform: scaleY(0.7) scaleX(1.2); opacity: 0.7; }
        }
        @keyframes done-cursor {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes deleting-cursor {
          0%, 100% { transform: scaleY(1) scaleX(1); opacity: 1; }
          50% { transform: scaleY(0.7) scaleX(1.2); opacity: 0.7; }
        }
        .cursor-typing { background: #f3f4f6; animation: typing-cursor ${typingSpeed * 2}ms ease-in-out infinite; }
        .cursor-done { background: #f3f4f6; animation: done-cursor 1.2s steps(1) infinite; }
        .cursor-deleting { background: #f3f4f6; animation: deleting-cursor ${deletingSpeed * 2}ms ease-in-out infinite; }
        .title-container { display: inline; position: relative; }
        .cursor { display: inline-block; position: relative; vertical-align: text-top; margin-left: 3px; margin-top: 5px; }
      `}</style>
      <div className="title-container">
        <span className="text-4xl font-bold mb-4 leading-tight theme-grad-text">
          {text}
          {showCursor && (
            <div
              className={`cursor w-1 h-8 rounded-sm inline-block ${
                isDeleting ? 'cursor-deleting' : (isTypingDone ? 'cursor-done' : 'cursor-typing')
              }`}
            />
          )}
        </span>
      </div>
    </div>
  );
};

export default TypingTitle;