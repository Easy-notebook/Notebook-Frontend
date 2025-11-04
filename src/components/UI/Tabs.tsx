import React, { createContext, useContext, useState } from 'react';

interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

const useTabsContext = () => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
};

interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  value: controlledValue,
  defaultValue,
  onValueChange,
  children,
  className = ''
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  
  const value = controlledValue !== undefined ? controlledValue : internalValue;
  const handleValueChange = (newValue: string) => {
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export const TabsList: React.FC<TabsListProps> = ({ children, className = '' }) => {
  return (
    <div className={`inline-flex h-9 items-center justify-center rounded-lg bg-slate-100/60 p-1 text-slate-500 ${className}`}>
      {children}
    </div>
  );
};

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export const TabsTrigger: React.FC<TabsTriggerProps> = ({ value, children, className = '' }) => {
  const { value: selectedValue, onValueChange } = useTabsContext();
  const isSelected = selectedValue === value;

  return (
    <button
      className={`
        inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium
        ring-offset-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none
        disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-slate-800
        data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-slate-300/50
        ${isSelected ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-300/50' : 'hover:bg-slate-100/60 text-slate-600 hover:text-slate-700'}
        ${className}
      `}
      onClick={() => onValueChange(value)}
      data-state={isSelected ? 'active' : 'inactive'}
    >
      {children}
    </button>
  );
};

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export const TabsContent: React.FC<TabsContentProps> = ({ value, children, className = '' }) => {
  const { value: selectedValue } = useTabsContext();
  
  if (selectedValue !== value) {
    return null;
  }

  return (
    <div className={`mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 ${className}`}>
      {children}
    </div>
  );
};
