import React, { useState, memo } from 'react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface ImageControlsProps {
  zoomIn: () => void;
  zoomOut: () => void;
  resetTransform: () => void;
}

interface ImageDisplayProps {
  imageData: string | { content?: string; path?: string; name?: string };
  width?: string | number;
  height?: string | number;
  imageInitialHeight?: string | number | null;
  className?: string;
  style?: React.CSSProperties;
  showControls?: boolean;
  showDetails?: boolean;
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  defaultPositionX?: number;
  defaultPositionY?: number;
  fileName?: string | null;
  lastModified?: string | number | null;
}

const ImageControls: React.FC<ImageControlsProps> = ({ zoomIn, zoomOut, resetTransform }) => {
    return (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex space-x-4 z-10 bg-white bg-opacity-20 backdrop-blur-lg rounded-full px-5 py-2.5 shadow-lg">
            <button
                onClick={() => zoomOut()}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-700 hover:bg-white hover:bg-opacity-25 transition-all duration-300"
                aria-label="Zoom out"
            >
                {/* 缩小图标 */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
            </button>

            <div className="w-px h-6 self-center bg-gray-300 bg-opacity-40"></div>

            <button
                onClick={() => resetTransform()}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-700 hover:bg-white hover:bg-opacity-25 transition-all duration-300"
                aria-label="Reset view"
            >
                {/* 重置图标 */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
            </button>

            <div className="w-px h-6 self-center bg-gray-300 bg-opacity-40"></div>

            <button
                onClick={() => zoomIn()}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-700 hover:bg-white hover:bg-opacity-25 transition-all duration-300"
                aria-label="Zoom in"
            >
                {/* 放大图标 */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
            </button>
        </div>
    );
};

const ImageDisplay: React.FC<ImageDisplayProps> = memo(({
    imageData,
    width = '100%',
    imageInitialHeight = null,
    className = '',
    showControls = true,
    showDetails = true,
    initialScale = 1,
    minScale = 0.1,
    maxScale = 5,
    defaultPositionX = 0,
    defaultPositionY = 0,
    fileName = null,
    lastModified = null
}) => {
    const [status, setStatus] = useState('loading');
    const [imgHeight, setImgHeight] = useState<string | number | undefined>(imageInitialHeight === null ? undefined : imageInitialHeight);
    const getImageSource = () => {
        if (!imageData) return null;
        if (typeof imageData === 'string') return imageData;
        if (imageData.content && typeof imageData.content === 'string') return imageData.content;
        if (imageData.path) return imageData.path;
        return null;
    };
    const imgSrc = getImageSource();

    const handleLoad = () => {
        setStatus('loaded');
        if (imageInitialHeight === null) {
            setImgHeight('auto');
        }
    };
    const handleError = () => {
        setStatus('error');
    };
    const renderFileInfo = () => {
        if (!fileName || !lastModified) return null;
        return (
            <table className="w-auto">
                <tbody>
                    <tr className="z-100 bg-white bg-opacity-20 backdrop-blur-lg">
                        <td className="pr-6 align-middle">
                            <span className="inline-flex items-center rounded-md bg-theme-600 px-2 py-1 text-xs font-medium text-white">Filename</span>
                        </td>
                        <td className="pr-6 text-sm font-medium align-middle">{fileName}</td>
                        <td className="pr-6 align-middle">
                            <span className="inline-flex items-center rounded-md bg-theme-600 px-2 py-1 text-xs font-medium text-white">Last edited</span>
                        </td>
                        <td className="pr-6 text-sm font-medium align-middle">{new Date(lastModified).toLocaleString()}</td>
                    </tr>
                </tbody>
            </table>
        );
    };

    // 无图片时的空状态
    if (!imgSrc) {
        return (
            <div
                className={`flex items-center justify-center bg-gray-50 backdrop-blur-sm rounded-xl ${className} h-screen`}
                style={{ width }}
            >
                <div className="text-center text-gray-400">
                    {/* 空状态图标 */}
                    <svg className="w-14 h-14 mx-auto text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-2 font-medium">No Image Available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            {/* Image content */}
            <div
                className={`relative flex items-center justify-center overflow-hidden ${className} ${fileName ? 'flex-1' : 'h-full'}`}
                style={{ width }}
            >
            {/* 加载动画 */}
            {status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 backdrop-blur-sm z-10">
                    <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-theme-500 animate-spin"></div>
                </div>
            )}

            
            {/* 文件详情 */}
            {showDetails && status === 'loaded' && (
                <div className="absolute top-0 left-0 right-0 bg-white bg-opacity-80 backdrop-blur-md py-3 px-5 transition-all duration-300 ease-in-out">
                    {renderFileInfo()}
                </div>
            )}

            {/* 错误提示 */}
            {status === 'error' ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-95">
                    <div className="text-center text-gray-600 max-w-xs">
                        <svg className="w-14 h-14 mx-auto text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="mt-3 font-medium">Unable to Load Image</p>
                        <p className="mt-1 text-sm text-gray-500">There was a problem displaying this image. Please try again.</p>
                    </div>
                </div>
            ) : (
                <TransformWrapper
                    initialScale={initialScale}
                    minScale={minScale}
                    maxScale={maxScale}
                    initialPositionX={defaultPositionX}
                    initialPositionY={defaultPositionY}
                    limitToBounds={false}
                    doubleClick={{ disabled: false }}
                    wheel={{ step: 0.1 }}
                >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            {showControls && status === 'loaded' && (
                                <ImageControls
                                    zoomIn={zoomIn}
                                    zoomOut={zoomOut}
                                    resetTransform={resetTransform}
                                />
                            )}
                            <TransformComponent
                                wrapperStyle={{ width: '100%', height: '100%' }}
                                contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <img
                                    src={imgSrc}
                                    alt={typeof imageData === 'object' ? (imageData.name || 'Image') : 'Image'}
                                    className={`rounded-md max-w-none transition-opacity duration-500 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'
                                        }`}
                                    style={{
                                        height: imgHeight,
                                        maxWidth: 'none',
                                        margin: '0 auto',
                                        objectFit: 'contain',
                                        transition: 'opacity 0.5s cubic-bezier(0.23, 1, 0.32, 1)'
                                    }}
                                    onLoad={handleLoad}
                                    onError={handleError}
                                />
                            </TransformComponent>
                        </>
                    )}
                </TransformWrapper>
            )}
            </div>
        </div>
    );
});

ImageDisplay.displayName = 'ImageDisplay';
export default ImageDisplay;