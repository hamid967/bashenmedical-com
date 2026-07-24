/**
 * ui-v3 — Unified UI layer (Phase 11).
 *
 * Thin, opinionated wrappers over the shadcn primitives in `@/components/ui/*`.
 * Rules:
 *  1. Never duplicate an existing primitive — re-export or compose it.
 *  2. Every wrapper adds real value (loading state, a11y wiring, layout).
 *  3. Keep RTL-safe defaults and design tokens from `src/styles.css`.
 *
 * Import surface:
 *   import { Button, Field, FieldGrid, SectionCard, DataTable,
 *            ConfirmDialog, FormDialog } from "@/components/ui-v3";
 *
 * Low-level primitives (Input, Select, Switch, Checkbox, Textarea, Badge,
 * Dialog, Popover, Tabs, etc.) are re-exported here unchanged from `@/components/ui`.
 */

// New wrappers
export { Button, buttonVariants, type ButtonProps } from "./Button";
export { Field, FieldGrid, type FieldProps } from "./Field";
export { SectionCard, type SectionCardProps } from "./SectionCard";
export { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";
export { FormDialog, type FormDialogProps } from "./FormDialog";
export { DataTable } from "./DataTable";

// Pass-through primitives (no duplication)
export { Input } from "@/components/ui/input";
export { Textarea } from "@/components/ui/textarea";
export { Label } from "@/components/ui/label";
export { Switch } from "@/components/ui/switch";
export { Checkbox } from "@/components/ui/checkbox";
export { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
export { Badge } from "@/components/ui/badge";
export { Separator } from "@/components/ui/separator";
export { Skeleton } from "@/components/ui/skeleton";
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
