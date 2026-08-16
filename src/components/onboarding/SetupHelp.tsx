import type { ReactNode } from 'react';
import { ArrowDown, ImageIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const setupWizardSlideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 28 : -28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -28 : 28, opacity: 0 }),
};

export function SetupPathTrail({ items }: { items: string[] }) {
  return (
    <ol className="flex flex-col gap-1.5 text-sm">
      {items.map((item, i) => (
        <li key={`${item}-${i}`} className="flex flex-col items-start">
          <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 font-medium text-foreground">
            {item}
          </span>
          {i < items.length - 1 && (
            <ArrowDown className="my-0.5 h-3.5 w-3.5 text-muted-foreground ml-3" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}

export type SetupHelpAccordionProps = {
  title: string;
  pathLabel: string;
  pathItems: string[];
  explanation: string;
  troubleshootingLabel: string;
  tips: string[];
  screenshotPlaceholder: string;
};

export function SetupHelpAccordion({
  title,
  pathLabel,
  pathItems,
  explanation,
  troubleshootingLabel,
  tips,
  screenshotPlaceholder,
}: SetupHelpAccordionProps) {
  return (
    <Accordion type="single" collapsible className="w-full rounded-xl border bg-muted/20 px-3">
      <AccordionItem value="help" className="border-0">
        <AccordionTrigger className="text-sm hover:no-underline py-3">{title}</AccordionTrigger>
        <AccordionContent className="space-y-4 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              {pathLabel}
            </p>
            <SetupPathTrail items={pathItems} />
          </div>
          <p className="text-sm text-muted-foreground">{explanation}</p>
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background/60 px-4 py-8 text-center"
            role="img"
            aria-label={screenshotPlaceholder}
          >
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">{screenshotPlaceholder}</p>
          </div>
          <div>
            <p className="text-sm font-medium mb-1.5">{troubleshootingLabel}</p>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export type SetupWizardHeaderProps = {
  title: string;
  description: string;
  descriptionId: string;
  estimatedTime: string;
  stepLabel: string;
  completeLabel: string;
  stepperAria: string;
  currentStep: number;
  totalSteps: number;
  isComplete: boolean;
};

export function SetupWizardProgress({
  estimatedTime,
  stepLabel,
  completeLabel,
  stepperAria,
  currentStep,
  totalSteps,
  isComplete,
}: Omit<SetupWizardHeaderProps, 'title' | 'description' | 'descriptionId'>) {
  const progressValue = isComplete ? 100 : (currentStep / totalSteps) * 100;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{estimatedTime}</span>
        {isComplete ? (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">{completeLabel}</span>
        ) : (
          <span className="font-medium text-foreground">{stepLabel}</span>
        )}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={Math.round(progressValue)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progressValue}%` }}
        />
      </div>
      <div className="flex gap-1.5 pt-1" role="list" aria-label={stepperAria}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const n = i + 1;
          const done = isComplete || n < currentStep;
          const active = !isComplete && n === currentStep;
          return (
            <div
              key={n}
              role="listitem"
              className={[
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                done ? 'bg-emerald-500' : '',
                active ? 'bg-primary' : '',
                !done && !active ? 'bg-muted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={active ? 'step' : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export function SetupStepHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="space-y-1 min-w-0">
        <h3 className="text-lg font-semibold tracking-tight leading-snug">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
