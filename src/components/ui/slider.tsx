"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "~/lib/utils";

/**
 * One thumb per value. Radix gives each thumb arrow-key, Page, Home, and End
 * handling, so `thumbLabels` is what tells a screen reader which is which.
 */
function Slider({
  className,
  thumbLabels,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  thumbLabels: string[];
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="bg-sunken border-border relative h-2 w-full grow overflow-hidden rounded-full border">
        <SliderPrimitive.Range className="bg-accent absolute h-full" />
      </SliderPrimitive.Track>
      {thumbLabels.map((label) => (
        <SliderPrimitive.Thumb
          key={label}
          aria-label={label}
          className="border-accent bg-panel block size-5 rounded-full border-2 shadow-sm transition-colors focus-visible:outline-offset-2 disabled:pointer-events-none"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
