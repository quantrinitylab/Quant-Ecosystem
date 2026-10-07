# M36 — QuantMail Workspace Design System

## Foundations

Shared tokens cover color semantics, typography, spacing, radius, elevation, icon size, motion duration, focus ring, breakpoints, and safe-area insets.

## Semantic colors

Use semantic roles rather than hard-coded product colors: surface, elevated surface, text primary/secondary, border, focus, selected, success, warning, danger, info, unread, security-critical, and disabled.

## Typography

The hierarchy must clearly distinguish app title, page title, section title, row title, metadata, supporting text, and system status. Numeric/date metadata should remain scannable at compact density.

## Core components

WorkspaceSwitcher, ProductRail, MobileAppHeader, UniversalSearch, QuantyLauncher, ContextRail, CommandBar, Breadcrumbs, SegmentedMode, DataList, DataGrid, ThreadRow, PersonRow, EventCard, FileCard, RepoRow, EmptyState, ErrorState, Skeleton, Toast, Dialog, Drawer, Sheet, Popover, Menu, Tooltip, Avatar, Badge, AttachmentChip, SecurityBanner, ApprovalCard.

## Component contract

Each component specifies: anatomy, states, keyboard behavior, pointer/touch behavior, accessibility name, loading behavior, error behavior, responsive behavior, and analytics event vocabulary.

## No one-off UI rule

If a pattern appears in two products, use a shared primitive unless there is a documented reason for product-specific behavior. Product-specific styling may exist without duplicating interaction semantics.
