import type { KeyboardEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SetupWizardProgress } from '@/components/onboarding/SetupHelp';
import { setupWizardSlideVariants } from '@/components/onboarding/SetupHelp';

export type SetupWizardShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  descriptionId: string;
  estimatedTime: string;
  stepOf: string;
  completeLabel: string;
  stepperAria: string;
  currentStep: number;
  totalSteps: number;
  phase: 'steps' | 'success';
  direction: number;
  onKeyDown?: (e: KeyboardEvent) => void;
  children: ReactNode;
  footer?: ReactNode;
  successTitle: string;
  successDescription: string;
  successPrimaryLabel: string;
  successSecondaryLabel: string;
  onSuccessPrimary: () => void;
  onSuccessSecondary: () => void;
};

export function SetupWizardShell({
  open,
  onOpenChange,
  title,
  description,
  descriptionId,
  estimatedTime,
  stepOf,
  completeLabel,
  stepperAria,
  currentStep,
  totalSteps,
  phase,
  direction,
  onKeyDown,
  children,
  footer,
  successTitle,
  successDescription,
  successPrimaryLabel,
  successSecondaryLabel,
  onSuccessPrimary,
  onSuccessSecondary,
}: SetupWizardShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[92vh] overflow-y-auto gap-0 p-0 sm:rounded-2xl"
        onKeyDown={onKeyDown}
        aria-describedby={descriptionId}
      >
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-6 pt-6 pb-4">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-xl sm:text-2xl tracking-tight">{title}</DialogTitle>
            <DialogDescription id={descriptionId} className="text-sm">
              {description}
            </DialogDescription>
          </DialogHeader>
          <SetupWizardProgress
            estimatedTime={estimatedTime}
            stepLabel={stepOf}
            completeLabel={completeLabel}
            stepperAria={stepperAria}
            currentStep={currentStep}
            totalSteps={totalSteps}
            isComplete={phase === 'success'}
          />
        </div>

        <div className="px-6 py-5 min-h-[320px]">
          <AnimatePresence mode="wait" custom={direction}>
            {phase === 'success' ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="flex flex-col items-center text-center gap-4 py-6"
              >
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.05 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-10 w-10" aria-hidden />
                </motion.div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold tracking-tight">{successTitle}</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">{successDescription}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={onSuccessPrimary}>
                    {successPrimaryLabel}
                  </Button>
                  <Button type="button" className="flex-1" onClick={onSuccessSecondary}>
                    {successSecondaryLabel}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={currentStep}
                custom={direction}
                variants={setupWizardSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="space-y-5"
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {phase === 'steps' && footer}
      </DialogContent>
    </Dialog>
  );
}
