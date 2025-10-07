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
        const gdriveRegex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
        const match = urlToFetch.match(gdriveRegex);

        if (match && match[1]) {
            const fileId = match[1];
            urlToFetch = `https://drive.google.com/uc?export=download&id=${fileId}`;
        }
        
        setTestUrl(rawUrl.trim()); // Store the original, user-facing URL

        try {
            // Using a more reliable CORS proxy to fetch from any URL.
            const proxyUrl = `https://file-proxy-cwma.onrender.com/proxy?url=${encodeURIComponent(urlToFetch)}`;
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                let errorHint = `Status: ${response.status} ${response.statusText}.`;
                if (rawUrl.includes('drive.google.com')) {
                    errorHint += ' For Google Drive links, please ensure the sharing permission is set to "Anyone with the link". Private files cannot be accessed.'
                }
                throw new Error(`Failed to fetch file from URL. ${errorHint}`);
            }
            
            const blob = await response.blob();
            
            if (blob.type.includes('html')) {
                let errorHint = 'The URL may be incorrect, private, or point to a webpage instead of a direct file link.';
                 if (rawUrl.includes('drive.google.com')) {
                    errorHint = 'This can happen with Google Drive if the file is private (please set sharing to "Anyone with the link") or if it is too large and requires a "virus scan" confirmation page. Please ensure it is a direct, public download link.';
                }
                throw new Error(`Failed to download the file. ${errorHint}`);
            }

            // Heuristic check for zip file, as Content-Type might not be reliable
            if (!blob.type.includes('zip') && !rawUrl.trim().endsWith('.zip')) {
                 console.warn('Warning: The file from the URL does not appear to be a ZIP file, but we will attempt to process it anyway.');
            }

            await processZipFile(blob);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred while fetching the URL.';
            setError(errorMessage);
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
            <header className="w-full bg-white shadow-md rounded-2xl py-6 mb-6 transition-all duration-300 hover:shadow-lg">
              <div className="text-center">
                <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 bg-clip-text text-transparent tracking-tight">Evaluation<span className="text-indigo-500">Lab</span></h1>
                <p className="mt-2 text-gray-500 text-sm md:text-base font-medium">Smart. Fast. Insightful Evaluations.</p>
              </div>
            </header>
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
                        testUrl={testUrl}
                    />
                )}
            </main>
        </div>
    );
};

export default App;
