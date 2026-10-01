-- Aczen Nova syncs are logged as their own import source.
alter table imports drop constraint if exists imports_source_check;
alter table imports add constraint imports_source_check check (source in ('csv', 'sample', 'nova'));
