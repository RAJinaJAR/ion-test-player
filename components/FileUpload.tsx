import React, { useState, useCallback } from 'react';

interface FileUploadProps {
    onFileUpload: (file: File) => void;
    onUrlSubmit: (url: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, onUrlSubmit }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [url, setUrl] = useState('');

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
                onFileUpload(file);
            } else {
                alert('Please upload a valid .zip file.');
            }
            e.dataTransfer.clearData();
        }
    }, [onFileUpload]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileUpload(e.target.files[0]);
        }
    };
    
    const handleUrlFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url.trim()) {
            onUrlSubmit(url.trim());
        }
    };

    const dragClasses = isDragging ? 'border-purple-500 bg-gray-800' : 'border-gray-600 hover:border-purple-400';

    return (
        <div className="w-full max-w-2xl text-center">
            <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`w-full p-10 border-4 border-dashed rounded-lg transition-all duration-300 ${dragClasses}`}
            >
                <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".zip"
                    onChange={handleFileChange}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="flex flex-col items-center">
                        <svg className="w-16 h-16 mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                        <p className="text-xl text-gray-400">
                            <span className="font-semibold text-purple-400">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-sm text-gray-500">Upload a local ZIP for a private session.</p>
                    </div>
                </label>
            </div>

            <div className="my-8 flex items-center" aria-hidden="true">
                <div className="flex-grow border-t border-gray-700"></div>
                <span className="flex-shrink mx-4 uppercase text-gray-500 font-semibold">Or</span>
                <div className="flex-grow border-t border-gray-700"></div>
            </div>

            <div className="w-full">
                <h3 className="text-2xl font-bold text-gray-200 mb-2">Create a Sharable Test</h3>
                <p className="text-sm text-gray-500 mb-4">
                    Load a test from a public URL to generate a link you can share with others. Publicly shared Google Drive links are also supported (set sharing to 'Anyone with the link').
                </p>
                <form onSubmit={handleUrlFormSubmit} className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/path/to/test.zip"
                        required
                        className="flex-grow px-4 py-3 bg-gray-800 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 transition-shadow"
                        aria-label="URL to test zip file"
                    />
                    <button 
                        type="submit"
                        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500"
                    >
                        Load Test
                    </button>
                </form>
            </div>
        </div>
    );
};