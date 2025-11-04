import { Loader2 } from 'lucide-react';

export default function ImportLoadingState({ fileName, progress }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md transform transition-all mx-auto">
                {/* Card Content */}
                <div className="p-8">
                    <div className="flex flex-col items-center gap-4">
                        {/* Loading Spinner */}
                        <div className="relative">
                            <Loader2 className="w-12 h-12 animate-spin text-theme-800" />
                        </div>

                        {/* Loading Text */}
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                Importing {fileName || 'File'}...
                            </h3>
                            <p className="text-sm text-gray-500">
                                Please wait while we process your file
                            </p>
                        </div>

                        {/* Progress Bar (optional) */}
                        {progress !== undefined && (
                            <div className="w-full mt-4">
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-theme-800 transition-all duration-300 ease-in-out"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <p className="text-sm text-gray-500 text-center mt-2">
                                    {progress}% Complete
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// // 使用示例：
// export function ExampleUsage() {
//     return (
//         <div className="relative min-h-screen">
//             {/* 您的主要内容 */}
//             <div className="p-4">
//                 <h1>Your App Content</h1>
//             </div>

//             {/* 导入加载状态 */}
//             <ImportLoadingState
//                 fileName="example.json"
//                 progress={45}
//             />
//         </div>
//     );
// }