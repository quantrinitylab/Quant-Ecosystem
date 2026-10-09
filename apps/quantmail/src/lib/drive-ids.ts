// BB-P1-6: document rows carry backend ids of the form `doc:<documentId>`.
// The drive page routes those to the document editor (which owns export),
// so a control that fires onDownloadFile(id) OPENS documents — its label
// must say "Open", never "Download". Zero dependencies: safe to import from
// presentational components without pulling in the full useDrive module.
export function isDocumentDriveId(driveId: string): boolean {
  return driveId.startsWith('doc:');
}
