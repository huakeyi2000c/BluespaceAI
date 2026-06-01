
REVOKE EXECUTE ON FUNCTION public.increment_site_visits() FROM anon, authenticated, public;
DROP FUNCTION public.increment_site_visits();

CREATE POLICY "anyone can update stats" ON public.site_stats
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
