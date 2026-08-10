begin;

grant select, insert, update, delete
on table
  public.payments,
  public.payment_service_items,
  public.payment_extra_items,
  public.payment_staff_totals,
  public.payment_settings
to service_role;

commit;
