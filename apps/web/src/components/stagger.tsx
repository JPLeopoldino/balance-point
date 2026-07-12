"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";

/**
 * Coordinated card entrance (doc 08 §8.6).
 *
 * The delay comes from `staggerChildren` on the container rather than a
 * per-card `index` prop: hand-numbered delays drift the moment a screen is
 * laid out in more than one section (each section restarts its own count), and
 * a card added in the middle silently renumbers everything after it. Motion
 * walks the variant tree through plain DOM wrappers, so <StaggerItem/> may sit
 * at any depth inside <Stagger/> and still take its turn in one single wave.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
};

export function Stagger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={container}
      initial={reduced ? false : "hidden"}
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
