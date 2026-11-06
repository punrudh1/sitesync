-- Allow Revit project files in the document metadata table.
-- The application and Drive RPC already accept .rvt; this aligns the database constraint.
alter table public.documents
  drop constraint if exists documents_extension_check;

alter table public.documents
  add constraint documents_extension_check
  check (extension in ('pdf','jpg','jpeg','png','docx','xlsx','csv','dwg','dxf','zip','txt','rvt'));
