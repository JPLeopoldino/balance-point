"use client"

import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react"

import { cn } from "@balance-point/ui/lib/utils"
import { Button, buttonVariants } from "@balance-point/ui/components/button"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
  size?: React.ComponentProps<typeof Button>["size"]
} & React.ComponentProps<"button">

function PaginationLink({
  className,
  isActive,
  size = "icon-sm",
  ...props
}: PaginationLinkProps) {
  return (
    <button
      type="button"
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({ variant: isActive ? "outline" : "ghost", size }),
        className
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  children,
  ...props
}: PaginationLinkProps) {
  return (
    <PaginationLink
      size="sm"
      className={cn("gap-1 px-2", className)}
      {...props}
    >
      <ChevronLeftIcon />
      {children ? <span className="hidden sm:block">{children}</span> : null}
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  children,
  ...props
}: PaginationLinkProps) {
  return (
    <PaginationLink
      size="sm"
      className={cn("gap-1 px-2", className)}
      {...props}
    >
      {children ? <span className="hidden sm:block">{children}</span> : null}
      <ChevronRightIcon />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-7 items-center justify-center text-muted-foreground",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon className="size-3.5" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
