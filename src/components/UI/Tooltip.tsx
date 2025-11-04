// components/UI/Tooltip.jsx
import React, { useState } from 'react';

const TooltipContext = React.createContext({
  isOpen: false,
  setIsOpen: () => {},
  content: null,
  setContent: () => {}
});

export const TooltipProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState(null);

  return (
    <TooltipContext.Provider value={{ isOpen, setIsOpen, content, setContent }}>
      {children}
    </TooltipContext.Provider>
  );
};

export const Tooltip = ({ children }) => (
  <div className="relative inline-block">
    {children}
  </div>
);

export const TooltipTrigger = ({ children, asChild }) => {
  const { setIsOpen, setContent } = React.useContext(TooltipContext);
  const Component = asChild ? 'span' : 'button';

  return (
    <Component
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      className="inline-block"
    >
      {children}
    </Component>
  );
};

export const TooltipContent = ({ children }) => {
  const { isOpen } = React.useContext(TooltipContext);

  if (!isOpen) return null;

  return (
    <div className="absolute z-50 px-2 py-1 text-sm text-white bg-gray-900 rounded shadow-lg -top-8 left-1/2 transform -translate-x-1/2">
      {children}
      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
    </div>
  );
};