import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../App';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface ThemeToggleProps {
  iconOnly?: boolean;
}

export default function ThemeToggle({ iconOnly = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={toggleTheme}
      className={cn(
        "flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors font-bold uppercase tracking-widest text-[10px]",
        iconOnly && "p-2"
      )}
      title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {theme === 'dark' ? (
        <>
          <Sun className="w-5 h-5" />
          {!iconOnly && "Light Mode"}
        </>
      ) : (
        <>
          <Moon className="w-5 h-5" />
          {!iconOnly && "Dark Mode"}
        </>
      )}
    </motion.button>
  );
}
