export interface ColumnDef {
  id: string;
  label: string;
  description: string;
  color: string;
  completesTask?: boolean; // When true, moving a task here marks it [x]
}

// System column for unassigned cards
export const NO_STATUS_COLUMN: ColumnDef = {
  id: "no_status",
  label: "No Status",
  description: "",
  color: "#545d68",
  completesTask: false,
};
