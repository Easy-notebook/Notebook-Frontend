// utils/iconMapping.ts

import {
    CheckCircle2,
    MenuIcon,
    ChevronDown,
    ChevronRight,
    ArrowRight,
    File, // 导入文件图标
    // 导入更多图标
    LucideIcon,
} from 'lucide-react';

// Type definition for icon mapping
type IconName = 'CheckCircle2' | 'MenuIcon' | 'ChevronDown' | 'ChevronRight' | 'ArrowRight' | 'File';

type IconMappingType = Record<IconName, LucideIcon>;

const iconMapping: IconMappingType = {
    CheckCircle2: CheckCircle2,
    MenuIcon: MenuIcon,
    ChevronDown: ChevronDown,
    ChevronRight: ChevronRight,
    ArrowRight: ArrowRight,
    File: File, // 添加文件图标映射
    // 添加更多映射
};

// Helper function to get icon by name with type safety
export const getIcon = (iconName: IconName): LucideIcon => {
    return iconMapping[iconName];
};

// Export icon names for type checking
export type { IconName };

export default iconMapping;
