import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const MobileDrawer = ({ isOpen, onClose, title, children }: MobileDrawerProps) => {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return null;
  }

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="flex items-center justify-between border-b border-border/30">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerClose asChild>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
};