"use client";

import React from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { cn } from "./cn";

export const Spinner: React.FC<{ size?: number; className?: string }> = ({
  size = 18,
  className,
}) => <CircleNotch size={size} className={cn("animate-spin", className)} />;
