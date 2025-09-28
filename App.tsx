import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Frame as RawFrame, FrameData, FrameBox, BoxType } from './types';
import { FileUpload } from './components/FileUpload';
import { TestPlayer } from './components/TestPlayer';

// Make JSZip available from the global window object loaded via CDN
declare const JSZip: any;

type GameState = 'uploading' | 'playing' | 'processing' | 'error';

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>('uploading');
    const [frames, setFrames] = useState<FrameData[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [testUrl, setTestUrl] = useState<string | null>(null);

    const cleanupResources = useCallback(() => {
        frames.forEach(frame => URL.revokeObjectURL(frame.imageDataUrl));
    }, [frames]);

    const handleReset = useCallback(() => {
        cleanupResources();
        setGameState('uploading');
        setFrames([]);
        setError(null);
        setTestUrl(null);
        // Clear query params from URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }, [cleanupResources]);

    const processZipFile = useCallback(async (file: File | Blob) => {
        try {
            const zip = await JSZip.loadAsync(file);

            let dataFile = null;
            for (const relativePath in zip.files) {
                if (relativePath.endsWith('.json') && !zip.files[relativePath].dir && !relativePath.startsWith('__MACOSX/')) {
                    dataFile = zip.file(relativePath);
                    break;
                }
            }

            if (!dataFile) {
                throw new Error('ZIP file must contain a JSON manifest file.');
            }

            const content = await dataFile.async('string');
            const parsedFrames: RawFrame[] = JSON.parse(content);
            
            if (!Array.isArray(parsedFrames) || parsedFrames.length === 0) {
                throw new Error('JSON file is empty or has an invalid format.');
            }
            
            const processedFrames: FrameData[] = await Promise.all(
              parsedFrames.map(async (frame) => {
                    const imagePath = Object.keys(zip.files).find(path => 
                        !zip.files[path].dir && (path.endsWith('/' + frame.image) || path === frame.image)
                    );

                    if (!imagePath) {
                        throw new Error(`Image file "${frame.image}" specified in the JSON was not found in the ZIP.`);
                    }
                    
                    const imageFile = zip.file(imagePath);
                    if (!imageFile) {
                         throw new Error(`Could not load image file: ${frame.image}`);
                    }

                    const blob = await imageFile.async('blob');
                    const url = URL.createObjectURL(blob);

                    const { width, height } = await new Promise<{width: number, height: number}>((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                        img.onerror = () => reject(new Error(`Could not get dimensions for image: ${frame.image}`));
                        img.src = url;
                    });

                    const boxes: FrameBox[] = [];
                    frame.hotspots.forEach(h => {
                        boxes.push({ ...h, id: crypto.randomUUID(), type: BoxType.HOTSPOT });
                    });
                    frame.inputs.forEach(i => {
                        boxes.push({ ...i, id: crypto.randomUUID(), type: BoxType.INPUT });
                    });

                    return {
                        id: crypto.randomUUID(),
                        imageFileName: frame.image,
                        imageDataUrl: url,
                        originalWidth: width,
                        originalHeight: height,
                        boxes,
                    };
                })
            );

            setFrames(processedFrames);
            setGameState('playing');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during file processing.';
            setError(errorMessage);
            setGameState('error');
            console.error(err);
        }
    }, []);

    const handleFileUpload = useCallback(async (file: File) => {
        setGameState('processing');
        setError(null);
        setTestUrl(null);
        await processZipFile(file);
    }, [processZipFile]);
    
    const handleUrlSubmit = useCallback(async (rawUrl: string) => {
  setGameState('processing');
  setError(null);

  let urlToFetch = rawUrl.trim();
  const originalUrl = urlToFetch;

  // Helper: cover several Drive URL patterns
  const normalizeGoogleDriveUrl = (u: string) => {
    // patterns:
    // https://drive.google.com/file/d/<id>/view?usp=sharing
    // https://drive.google.com/open?id=<id>
    // https://drive.google.com/uc?id=<id>&export=download
    // https://drive.google.com/drive/folders/<folderId>  -> not supported
    const fileIdMatch = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
                      || u.match(/[?&]id=([a-zA-Z0-9_-]+)/)
                      || u.match(/\/uc\?id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
    }
    return null;
  };

  // If it's a google drive link, normalize
  if (urlToFetch.includes('drive.google.com')) {
    const normalized = normalizeGoogleDriveUrl(urlToFetch);
    if (normalized) {
      urlToFetch = normalized;
    }
    // else keep original (in case it's some non standard link)
  }

  setTestUrl(originalUrl); // keep original for shareable link

  try {
    // Try fetching the file directly (no third-party proxy)
    // NOTE: If Google Drive doesn't give CORS headers, the browser may block this request.
    const response = await fetch(urlToFetch, {
      method: 'GET',
      // credentials: 'include', // DO NOT enable unless you expect cookies (not recommended)
    });

    // If fetch itself succeeded but the server returned an HTML page (Drive's virus-scan/confirm page etc),
    // treat it as failure — we expect a binary blob (zip).
    if (!response.ok) {
      let errorHint = `Status: ${response.status} ${response.statusText}.`;
      if (originalUrl.includes('drive.google.com')) {
        errorHint += ' Ensure the file is shared "Anyone with the link" (public).';
      }
      throw new Error(`Failed to fetch file from URL. ${errorHint}`);
    }

    // Get blob
    const blob = await response.blob();

    // If we unexpectedly received HTML, it's likely a Drive confirmation/landing page
    if (blob.type.includes('html')) {
      let errorHint = 'The URL returned HTML (not a binary file).';
      if (originalUrl.includes('drive.google.com')) {
        errorHint = 'Google Drive returned an HTML page — the file may be private or too large (requires confirmation). Make sure sharing is "Anyone with the link" and try again, or use a server-side proxy/Drive API.';
      }
      throw new Error(`Failed to download the file. ${errorHint}`);
    }

    // Basic heuristic for zip
    if (!blob.type.includes('zip') && !originalUrl.toLowerCase().endsWith('.zip')) {
      console.warn('Warning: the downloaded blob does not appear to be a zip file (Content-Type mismatch). Trying to process anyway.');
    }

    // If we reach here, forward blob to processZipFile
    await processZipFile(blob);

  } catch (err) {
    // If CORS blocked the request, browsers typically throw a TypeError with no useful message.
    // Detect that and provide a clearer hint.
    let msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Failed to fetch' || msg === 'NetworkError when attempting to fetch resource.' || msg === 'TypeError: Failed to fetch') {
      msg = 'Browser blocked the cross-origin request (CORS). For Google Drive, ensure the file is shared "Anyone with the link". If that does not help, you will need a server-side proxy or to use the Google Drive API to download the file.';
    }
    setError(msg);
    setGameState('error');
    console.error(err);
  }
}, [processZipFile]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlFromQuery = params.get('testUrl');
        if (urlFromQuery) {
            handleUrlSubmit(urlFromQuery);
        }
    }, [handleUrlSubmit]);

    const shareableLink = useMemo(() => {
        if (!testUrl) return undefined;
        const url = new URL(window.location.href);
        url.search = `?testUrl=${encodeURIComponent(testUrl)}`;
        return url.toString();
    }, [testUrl]);


    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-900">
            <main className="w-full max-w-9xl flex-grow flex items-center justify-center">
                {gameState === 'uploading' && <FileUpload onFileUpload={handleFileUpload} onUrlSubmit={handleUrlSubmit} />}
                {gameState === 'processing' && <div className="text-xl">Processing your test...</div>}
                {(gameState === 'error') && (
                    <div className="text-center p-8 bg-gray-800 rounded-lg shadow-lg">
                        <h2 className="text-2xl text-red-400 mb-4">An Error Occurred</h2>
                        <p className="text-gray-300 mb-6">{error}</p>
                        <button
                            onClick={handleReset}
                            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-semibold transition-colors">
                            Try Again
                        </button>
                    </div>
                )}
                {gameState === 'playing' && frames.length > 0 && (
                    <TestPlayer
                        frames={frames}
                        onExitTest={handleReset}
                        shareableLink={shareableLink}
                    />
                )}
            </main>
        </div>
    );
};

export default App;
