# Brand assets (supply these)

The site intentionally ships **without** the church logo. Please add files you
have permission to use:

| File | Used for | Spec |
|---|---|---|
| `src/app/icon.png` | Browser tab favicon | 512×512 PNG, square, transparent background |
| `src/app/apple-icon.png` | iOS home-screen icon | 180×180 PNG, no transparency |
| `public/brand/logo.svg` | Header logo | SVG (preferred) or a 2× PNG, about 240×40 |

After adding `logo.svg`, set `LOGO_SRC` in `src/components/Logo.tsx` to
`'/brand/logo.svg'`. The dashed "LOGO" box in the header is the placeholder.
