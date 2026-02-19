-- Final fallback fix: allow authenticated clients to create their own chat conversation
-- regardless of company_id shape (company profile vs direct uid).

drop policy if exists "chat conversations insert" on public.chat_conversations;

create policy "chat conversations insert"
  on public.chat_conversations
  for insert
  to authenticated
  with check (
    public.e_admin()
    or created_by = auth.uid()
  );
