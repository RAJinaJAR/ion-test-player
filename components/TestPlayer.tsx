import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FrameData, BoxType, InputBox, HotspotBox, LeaderboardEntry } from '../types';
import TestFramePlayer, { TestFramePlayerRef } from './TestFramePlayer';
import { ChevronLeftIcon, ChevronRightIcon, ShareIcon, ClockIcon, TrophyIcon } from './icons';

interface TestPlayerProps {
  frames: FrameData[];
  onExitTest: () => void;
  shareableLink?: string;
  testUrl?: string | null;
}

interface UserAnswer {
  inputs: Record<string, string>;
  hotspotsClicked: Record<string, boolean>;
}

interface BackgroundMistake {
    x: number;
    y: number;
}

interface SequenceState {
    nextOrder: number;
}

// IMPORTANT: Leaderboard functionality requires a backend endpoint.
// 1. Create a Google Apps Script Web App.
// 2. It should handle a POST request to add a score and a GET request to fetch scores.
// 3. Replace the placeholder URL below with your actual deployed Web App URL.
const GOOGLE_SHEET_WEB_APP_URL = `https://script.google.com/macros/s/AKfycbwgEnUUGRvjOYnt46yoxEUFXw8yTMfwa9JS3rSUETyyYMyJT2CjpMmTG4QlSwdcrIDC/exec`;

const maskEmail = (email?: string): string => {
    if (!email || !email.includes('@')) return 'Anonymous';
    const [name, domain] = email.split('@');
    if (name.length <= 3) return `${name[0]}***@${domain}`;
    return `${name.substring(0, 3)}***@${domain}`;
};

const LeaderboardDisplay: React.FC<{ data: LeaderboardEntry[], currentUserEmail: string, formatTime: (t: number) => string }> = ({ data, currentUserEmail, formatTime }) => (
    <div className="w-full mt-4 p-4 md:p-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
        <h3 className="text-2xl font-bold text-center mb-4 text-purple-400 flex items-center justify-center gap-2">
            <TrophyIcon /> Leaderboard
        </h3>
        <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left min-w-[400px]">
                <thead className="sticky top-0 bg-gray-800">
                    <tr className="border-b-2 border-gray-600">
                        <th className="p-2 font-semibold text-gray-300">Rank</th>
                        <th className="p-2 font-semibold text-gray-300">Player</th>
                        <th className="p-2 font-semibold text-gray-300 text-right">Score</th>
                        <th className="p-2 font-semibold text-gray-300 text-right">Time</th>
                    </tr>
                </thead>
                <tbody>
                    {data.length > 0 ? data.map((entry, index) => (
                        <tr key={index} className={`border-b border-gray-700 ${entry.email === currentUserEmail ? 'bg-purple-900/50' : ''}`}>
                            <td className="p-3 font-bold">{index + 1}</td>
                            <td className="p-3">{maskEmail(entry.email)}</td>
                            <td className="p-3 text-right font-mono">{entry.score} / {entry.totalPossible}</td>
                            <td className="p-3 text-right font-mono">{formatTime(entry.time)}</td>
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan={4} className="text-center p-4 text-gray-400">No scores yet. Be the first!</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);


export const TestPlayer: React.FC<TestPlayerProps> = ({ frames, onExitTest, shareableLink, testUrl }) => {
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, UserAnswer>>(
    () => frames.reduce((acc, frame) => {
      acc[frame.id] = { inputs: {}, hotspotsClicked: {} };
      return acc;
    }, {} as Record<string, UserAnswer>)
  );
  const [showResults, setShowResults] = useState(false);
  const [justClickedHotspotId, setJustClickedHotspotId] = useState<string | null>(null);
  const [frameMistakes, setFrameMistakes] = useState<Record<string, boolean>>({});
  const [hotspotMistakeCount, setHotspotMistakeCount] = useState<number>(0);
  const [backgroundMistakes, setBackgroundMistakes] = useState<Record<string, BackgroundMistake[]>>({});
  const [backgroundMistakeCount, setBackgroundMistakeCount] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sequenceState, setSequenceState] = useState<Record<string, SequenceState>>({});
  const [elapsedTime, setElapsedTime] = useState(0);
  const [testStarted, setTestStarted] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[] | null>(null);
  const [isFetchingLeaderboard, setIsFetchingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const framePlayerRef = useRef<TestFramePlayerRef>(null);

  useEffect(() => {
    if (showResults || !testStarted) {
        return;
    }

    const timerId = setInterval(() => {
        setElapsedTime(prevTime => prevTime + 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, [showResults, testStarted]);

  const currentFrameData = frames[currentFrameIdx];
  const currentUserAnswerForFrame = userAnswers[currentFrameData.id] || { inputs: {}, hotspotsClicked: {} };
  
  const handleMistakeOccurred = useCallback(() => {
    if (showResults || !currentFrameData) return;
    setFrameMistakes(prev => ({ ...prev, [currentFrameData.id]: true }));
    framePlayerRef.current?.triggerMistakeFlash();
  }, [currentFrameData, showResults]);
  
  const { orderedHotspots, isSequential } = useMemo(() => {
    if (!currentFrameData) return { orderedHotspots: [], isSequential: false };
    const hotspots = currentFrameData.boxes
        .filter((b): b is HotspotBox => b.type === BoxType.HOTSPOT && typeof b.order === 'number')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return {
        orderedHotspots: hotspots,
        isSequential: hotspots.length > 1,
    };
  }, [currentFrameData]);

  const handleShareClick = useCallback(() => {
    if (!shareableLink) return;
    navigator.clipboard.writeText(shareableLink).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
    });
  }, [shareableLink]);

  const navigate = useCallback((direction: 'next' | 'prev') => {
    if (direction === 'next') {
      if (currentFrameIdx < frames.length - 1) {
        setCurrentFrameIdx(currentFrameIdx + 1);
      } else {
        setShowResults(true);
      }
    } else if (direction === 'prev') {
      if (currentFrameIdx > 0) {
        setCurrentFrameIdx(currentFrameIdx - 1);
      }
    }
  }, [currentFrameIdx, frames.length]);

  const handleInputChange = useCallback((boxId: string, value: string) => {
    setUserAnswers(prev => ({
      ...prev,
      [currentFrameData.id]: {
        ...prev[currentFrameData.id],
        inputs: { ...prev[currentFrameData.id].inputs, [boxId]: value },
      },
    }));
  }, [currentFrameData.id]);

  const handleHotspotInteraction = useCallback((boxId: string) => {
    if (showResults) return;

    const box = currentFrameData.boxes.find(b => b.id === boxId);
    if (!box || box.type !== BoxType.HOTSPOT) return;
    const clickedHotspot = box as HotspotBox;

    const recordClick = () => {
  setUserAnswers(prev => ({
    ...prev,
    [currentFrameData.id]: {
      ...(prev[currentFrameData.id] || { inputs: {}, hotspotsClicked: {} }),
      hotspotsClicked: { 
          ...((prev[currentFrameData.id] || {}).hotspotsClicked || {}), 
          [boxId]: true 
      },
    },
  }));
  };


    if (!isSequential) {
        recordClick();
        setJustClickedHotspotId(boxId);
        setTimeout(() => {
            navigate('next');
            setJustClickedHotspotId(null);
        }, 200);
        return;
    }
    
    // Logic for sequential frames from here
    const progress = sequenceState[currentFrameData.id] || { nextOrder: 1 };
    
    const isOrderedHotspot = typeof clickedHotspot.order === 'number';

    if (isOrderedHotspot && clickedHotspot.order === progress.nextOrder) {
        // Correct click in a sequence
        recordClick();
        setSequenceState(prev => ({
            ...prev,
            [currentFrameData.id]: { ...progress, nextOrder: progress.nextOrder + 1 }
        }));
        setJustClickedHotspotId(boxId);

        const isLastInSequence = progress.nextOrder === orderedHotspots.length;

        setTimeout(() => {
            setJustClickedHotspotId(null);
            if (isLastInSequence) navigate('next');
        }, 200);

    } else {
        // Mistake: clicked an unordered hotspot or an ordered one out of sequence.
        setHotspotMistakeCount(prev => prev + 1);
        handleMistakeOccurred();
    }
  }, [showResults, currentFrameData, navigate, isSequential, orderedHotspots, sequenceState, handleMistakeOccurred]);

  const handleFrameClickMistake = useCallback((coords: BackgroundMistake) => {
    if (showResults) return;
    // Only count background clicks as mistakes for scoring if frame has hotspots
    if (currentFrameData?.boxes.some(box => box.type === BoxType.HOTSPOT)) {
        setBackgroundMistakeCount(prev => prev + 1);
        setBackgroundMistakes(prev => ({
            ...prev,
            [currentFrameData.id]: [
                ...(prev[currentFrameData.id] || []),
                coords
            ]
        }));
        handleMistakeOccurred();
    }
  }, [currentFrameData, handleMistakeOccurred, showResults]);

  const handleInputBlur = useCallback(() => {
    if (showResults || !currentFrameData) return;
    const isInputsOnlyFrame = 
        currentFrameData.boxes.length > 0 && 
        currentFrameData.boxes.every(box => box.type === BoxType.INPUT);

    if (!isInputsOnlyFrame) return;

    const inputBoxes = currentFrameData.boxes.filter(box => box.type === BoxType.INPUT);
    const allInputsFilled = inputBoxes.every(box => {
      const answer = currentUserAnswerForFrame?.inputs[box.id];
      return answer && answer.trim() !== '';
    });

    if (allInputsFilled) {
      setTimeout(() => navigate('next'), 150);
    }
  }, [currentFrameData, currentUserAnswerForFrame, navigate, showResults]);

  const { score, totalPossible } = useMemo(() => {
    if (!showResults) return { score: 0, totalPossible: 0 };
    let s = 0;
    let t = 0;
    frames.forEach(frame => {
      const frameAnswers = userAnswers[frame.id];
      frame.boxes.forEach(box => {
        t++;
        if (box.type === BoxType.INPUT) {
          const userAnswer = frameAnswers?.inputs[box.id] ?? '';
          if (userAnswer.trim().toLowerCase() === (box as InputBox).expected.trim().toLowerCase()) {
            s++;
          }
        } else if (box.type === BoxType.HOTSPOT) {
          // Score is based on correctly clicked hotspots, regardless of subsequent mistakes on the frame.
          if (frameAnswers?.hotspotsClicked[box.id]) {
            s++;
          }
        }
      });
    });

    const totalMistakes = hotspotMistakeCount + backgroundMistakeCount;
    s -= totalMistakes;

    return { score: Math.max(0, s), totalPossible: t };
  }, [showResults, frames, userAnswers, hotspotMistakeCount, backgroundMistakeCount]);
  
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const fetchLeaderboard = useCallback(async () => {
    if (!testUrl || GOOGLE_SHEET_WEB_APP_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
        return;
    }
    setIsFetchingLeaderboard(true);
    setLeaderboardError(null);
    try {
        const url = new URL(GOOGLE_SHEET_WEB_APP_URL);
        url.searchParams.append('action', 'getLeaderboard');
        url.searchParams.append('testUrl', testUrl);
        const proxyUrl = `https://file-proxy-cwma.onrender.com/proxy?url=${encodeURIComponent(url.toString())}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Failed to fetch leaderboard data.');
        
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
            setLeaderboardData(result.data);
        } else {
            throw new Error(result.message || 'Invalid leaderboard data format.');
        }
    } catch (err) {
        console.error("Leaderboard fetch failed:", err);
        setLeaderboardError("Could not load the leaderboard.");
    } finally {
        setIsFetchingLeaderboard(false);
    }
  }, [testUrl]);

  useEffect(() => {
    if (showResults && userEmail && testUrl && !leaderboardData && !isSubmittingScore && !submissionError) {
        const submitScore = async () => {
    if (!testUrl) return;

    setIsSubmittingScore(true);
    setSubmissionError(null);

    try {
        // Build query parameters for the Google Apps Script
        const params = new URLSearchParams({
            action: 'addScore',
            email: userEmail,
            score: score.toString(),
            totalPossible: totalPossible.toString(),
            time: elapsedTime.toString(),
            testUrl: testUrl,
            timestamp: new Date().toISOString()
        });

        // Use your proxy URL
        const proxyUrl = `https://file-proxy-cwma.onrender.com/proxy?url=${encodeURIComponent(GOOGLE_SHEET_WEB_APP_URL + '?' + params.toString())}`;

        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Server responded with an error.");

        const result = await response.json();
        if (!result.success) throw new Error(result.message || "Failed to submit score.");

        // Fetch updated leaderboard
        await fetchLeaderboard();

    } catch (err) {
        console.error("Score submission failed:", err);
        setSubmissionError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
        setIsSubmittingScore(false);
    }
};

        submitScore();
    }
  }, [showResults, userEmail, testUrl, score, totalPossible, elapsedTime, fetchLeaderboard, leaderboardData, isSubmittingScore, submissionError]);


  if (!currentFrameData) {
    return (
      <div className="p-4 text-red-500 flex flex-col items-center justify-center h-full">
          Error: Test data is corrupted or unavailable.
          <button onClick={onExitTest} className="mt-4 px-4 py-2 bg-purple-600 text-white rounded">
            Start Over
          </button>
      </div>
    );
  }
  
  const isLastFrame = currentFrameIdx === frames.length - 1;
  const totalMistakes = hotspotMistakeCount + backgroundMistakeCount;
  const mistakeBreakdown = [];
  if (hotspotMistakeCount > 0) {
    mistakeBreakdown.push(`${hotspotMistakeCount} wrong hotspot click${hotspotMistakeCount !== 1 ? 's' : ''}`);
  }
  if (backgroundMistakeCount > 0) {
    mistakeBreakdown.push(`${backgroundMistakeCount} background click${backgroundMistakeCount !== 1 ? 's' : ''}`);
  }

  return (
    <div className="w-full h-full flex flex-col items-center p-2 md:p-4" role="application">
      {!testStarted ? (
        <div className="flex-grow flex items-center justify-center">
          <div className="max-w-2xl w-full text-center bg-gray-800 p-8 sm:p-12 rounded-2xl shadow-2xl border border-gray-700">
            <h2 className="text-4xl font-extrabold text-gray-100 mb-4">
              Ready to Begin?
            </h2>
            <p className="text-lg text-gray-300 mb-8 leading-relaxed">
              Enter your email to save your score. Then, follow the on-screen prompts. The timer starts when you begin.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); setTestStarted(true); }} className="flex flex-col gap-4">
              <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  required
                  className="w-full px-4 py-3 bg-gray-900 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 transition-shadow"
                  aria-label="Your email for the leaderboard"
              />
              <button
                type="submit"
                disabled={!userEmail.includes('@')}
                className="px-12 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xl rounded-lg shadow-lg transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-4 focus:ring-offset-gray-800 focus:ring-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:transform-none disabled:hover:bg-gray-600"
                aria-label="Start the test now"
              >
                Start the Test!
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          <header className="w-full max-w-7xl mb-4">
            <div className="bg-gray-800 p-3 rounded-lg shadow-lg space-y-3">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div>
                            <h2 className="text-xl md:text-2xl font-bold text-gray-200">
                            {showResults ? "Test Review" : "Test in Progress"}
                            </h2>
                            <p className="text-gray-400" aria-live="polite">Frame {currentFrameIdx + 1} of {frames.length}</p>
                        </div>
                        {!showResults && (
                            <div className="hidden sm:flex items-center gap-2 text-lg font-mono bg-gray-900 px-3 py-1 rounded-md text-gray-200" aria-label={`Time elapsed: ${formatTime(elapsedTime)}`}>
                                <ClockIcon className="h-5 w-5 text-purple-400" />
                                <span aria-hidden="true">{formatTime(elapsedTime)}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {shareableLink && (
                        <button
                            onClick={handleShareClick}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-all"
                            aria-label="Copy shareable link to clipboard"
                        >
                            <ShareIcon /> <span className="hidden md:inline">{copiedLink ? 'Link Copied!' : 'Share Test'}</span>
                        </button>
                        )}
                        <button
                        onClick={onExitTest}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                        aria-label="Exit Test"
                        >
                        <span className="hidden md:inline">Exit Test</span>
                        <span className="md:hidden">Exit</span>
                        </button>
                    </div>
                </div>
              
                {!showResults && (
                    <div>
                        <div className="w-full bg-gray-700 rounded-full h-2.5" role="progressbar" aria-valuenow={currentFrameIdx + 1} aria-valuemin={1} aria-valuemax={frames.length} aria-label="Test progress">
                            <div 
                                className="bg-purple-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                                style={{ width: `${((currentFrameIdx + 1) / frames.length) * 100}%` }}>
                            </div>
                        </div>
                    </div>
                )}
            </div>
          </header>

          <main className="w-full max-w-7xl flex-grow">
            <TestFramePlayer
              ref={framePlayerRef}
              key={currentFrameData.id}
              frame={currentFrameData}
              onInputChange={handleInputChange}
              onHotspotInteraction={handleHotspotInteraction}
              onFrameClickMistake={handleFrameClickMistake} 
              onInputBlur={handleInputBlur}
              userInputsForFrame={currentUserAnswerForFrame?.inputs || {}}
              userHotspotsClickedForFrame={currentUserAnswerForFrame?.hotspotsClicked || {}}
              showResults={showResults}
              backgroundMistakesForFrame={backgroundMistakes[currentFrameData.id]}
              justClickedHotspotId={justClickedHotspotId}
            />
          </main>

          <footer className="w-full max-w-7xl mt-4 flex flex-col items-center space-y-4">
            {showResults && (
                <>
                    <div role="status" aria-live="assertive" className="p-4 bg-gray-800 border border-purple-500 rounded-lg text-gray-200 w-full text-center shadow-lg">
                        <h3 className="text-xl font-bold text-purple-400">Test Complete!</h3>
                        <p className="text-lg mt-1">Your score: {score} / {totalPossible}</p>
                        <p className="text-md mt-1 text-gray-400">Total Time: {formatTime(elapsedTime)}</p>
                        {totalMistakes > 0 && (
                          <p className="text-sm text-red-400 mt-1">
                            {totalMistakes} point{totalMistakes === 1 ? '' : 's'} deducted for incorrect clicks ({mistakeBreakdown.join(' & ')}).
                          </p>
                        )}
                        <p className="text-sm mt-2 text-gray-400">You can now review your answers using the navigation buttons below.</p>
                    </div>

                    {testUrl && (
                      <div className="w-full">
                        {isSubmittingScore && <p className="text-center text-gray-300">Submitting your score...</p>}
                        {submissionError && <p className="text-center text-red-400">Error: {submissionError}</p>}
                        {isFetchingLeaderboard && <p className="text-center text-gray-300">Loading leaderboard...</p>}
                        {leaderboardError && <p className="text-center text-red-400">{leaderboardError}</p>}
                        {leaderboardData && <LeaderboardDisplay data={leaderboardData} currentUserEmail={userEmail} formatTime={formatTime} />}
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center w-full p-3 bg-gray-800 rounded-lg shadow-lg">
                        <button
                            onClick={() => navigate('prev')}
                            disabled={currentFrameIdx === 0}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                            aria-label="Previous Frame"
                        >
                            <ChevronLeftIcon /> Previous
                        </button>
                        <button
                            onClick={() => navigate('next')}
                            disabled={isLastFrame}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                            aria-label="Next Frame for Review"
                        >
                            Next (Review) <ChevronRightIcon />
                        </button>
                    </div>
                </>
            )}
          </footer>
        </>
      )}
    </div>
  );
};
