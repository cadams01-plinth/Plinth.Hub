-- Catalogue seed (SPEC §13). The authoritative catalogue table lives in
-- PLINTH_HUB_BUILD.md §16, which is [TO RESTORE] — entries below are
-- reconstructed from SPEC §1's architecture diagram. The four verification
-- items §13 flags could not be recovered with the lost master doc; each
-- TODO below needs Chris's confirmation before launch.

insert into apps (slug, name, category, one_liner, description, status, app_url, redirect_urls, sort_order)
values
  (
    'itp-engine', 'ITP Engine', 'Quality',
    'Inspection and test plans without the spreadsheet grind.',
    'Build, issue and track ITPs against your project specifications.',
    'beta',                                              -- TODO(verify): launch status
    'https://itp.plinthresource.com',
    array['https://itp.plinthresource.com/auth/plinth'], -- TODO(verify): callback path
    10
  ),
  (
    'bid-studio', 'Bid Studio', 'Commercial',
    'Assemble compliant, costed bids faster.',
    'Tender library, pricing structure and submission assembly for civils bids.',
    'coming_soon',                                       -- TODO(verify): launch status
    'https://bids.plinthresource.com',
    array['https://bids.plinthresource.com/auth/plinth'],-- TODO(verify): callback path
    20
  ),
  (
    'plinth-demo', 'Plinth Demo App', 'Internal',
    'Internal SSO verification target (AT-04).',
    'Hidden from customers; exercises the PLT launch flow end to end.',
    'hidden',
    'http://localhost:4000',
    array['http://localhost:4000/'],
    999
  )
on conflict (slug) do nothing;
