export const Alert = ({ children, variant = 'default', className = '' }) => {
  const variantClasses = {
    default: 'bg-white border-l-4 border-gray-300 text-gray-800',
    primary: 'bg-white border-l-4 border-theme-800 text-gray-800',
    destructive: 'bg-white border-l-4 border-red-600 text-gray-800',
    success: 'bg-white border-l-4 border-green-600 text-gray-800'
  };

  return (
    <div className={`mb-6 shadow-sm ${variantClasses[variant]} ${className}`}>
      <div className="px-6 py-4">
        {children}
      </div>
    </div>
  );
};

export const AlertTitle = ({ children, className = '' }) => (
  <h5 className={`text-lg font-medium text-theme-800 mb-2 ${className}`}>
    {children}
  </h5>
);

export const AlertDescription = ({ children, className = '' }) => (
  <div className={`text-gray-900 text-base leading-relaxed ${className}`}>
    {children}
  </div>
);

export default Alert;