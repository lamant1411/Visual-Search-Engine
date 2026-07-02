import './index.css'
import { Button } from './components/base/button'
import { Card, CardHeader, CardBody, CardFooter } from './components/base/card'
import { Typography } from './components/base/typography'
import { Input, Textarea } from './components/base/input'
import { Loader, Skeleton } from './components/base/loader'
import { Tag } from './components/base/tag'
import { ColorPalette } from './components/base/colorPalette'

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)
const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
)

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <Typography variant="overline" color="muted">{label}</Typography>
    {children}
  </section>
)

export default function App() {
  return (
    <div className="min-h-screen bg-[#f8f7ff] p-8">
      <div className="max-w-4xl mx-auto space-y-12">

        {/* Header */}
        <div className="text-center space-y-3 py-8">
          <Typography variant="h1" gradient>Visual Search Engine</Typography>
          <Typography variant="body-lg" color="secondary">
            Base Component Library · Tailwind CSS v4 · Light Theme
          </Typography>
        </div>

        {/* Typography */}
        <Section label="Typography">
          <Card variant="elevated" padding="lg">
            <div className="space-y-4">
              {(['h1','h2','h3','h4','h5','h6'] as const).map(v => (
                <Typography key={v} variant={v}>{v.toUpperCase()} – The quick brown fox</Typography>
              ))}
              <div className="border-t border-[rgba(109,40,217,0.1)] pt-4 space-y-2">
                <Typography variant="body-lg">Body LG – Lorem ipsum dolor sit amet consectetur.</Typography>
                <Typography variant="body-md" color="secondary">Body MD – Secondary text for supporting content.</Typography>
                <Typography variant="caption" color="muted">Caption · Muted metadata text</Typography>
                <Typography variant="overline" color="accent">Overline Label</Typography>
                <Typography variant="h3" gradient>Gradient Heading</Typography>
              </div>
            </div>
          </Card>
        </Section>

        {/* Buttons */}
        <Section label="Buttons">
          <Card variant="elevated" padding="lg">
            <div className="space-y-6">
              <div>
                <Typography variant="label" color="muted" className="mb-3 block">Variants</Typography>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                </div>
              </div>
              <div>
                <Typography variant="label" color="muted" className="mb-3 block">Sizes</Typography>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </div>
              </div>
              <div>
                <Typography variant="label" color="muted" className="mb-3 block">States & Icons</Typography>
                <div className="flex flex-wrap gap-3">
                  <Button leftIcon={<SearchIcon />}>With Icon</Button>
                  <Button loading>Loading…</Button>
                  <Button disabled>Disabled</Button>
                  <Button rightIcon={<StarIcon />} variant="secondary">Right Icon</Button>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        {/* Cards */}
        <Section label="Cards">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['default', 'elevated', 'outlined', 'glass'] as const).map(v => (
              <Card key={v} variant={v} hoverable padding="md">
                <CardHeader>
                  <Typography variant="h5">{v.charAt(0).toUpperCase() + v.slice(1)} Card</Typography>
                </CardHeader>
                <CardBody>
                  <Typography variant="body-md" color="secondary">
                    A {v} card with hover animation and padding.
                  </Typography>
                </CardBody>
                <CardFooter>
                  <Typography variant="caption" color="muted">Footer content area</Typography>
                </CardFooter>
              </Card>
            ))}
          </div>
        </Section>

        {/* Inputs */}
        <Section label="Inputs">
          <Card variant="elevated" padding="lg">
            <div className="space-y-5">
              <Input label="Search" placeholder="Search for images…" leftIcon={<SearchIcon />} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Username" placeholder="Enter username" variant="default" />
                <Input label="Email" placeholder="you@example.com" variant="filled" />
              </div>
              <Input label="With Error" placeholder="Invalid value" errorMessage="This field is required" />
              <Input label="With Helper" placeholder="Optional field" helperText="We'll never share this." />
              <Textarea label="Description" placeholder="Tell us about your search…" />
            </div>
          </Card>
        </Section>

        {/* Tags */}
        <Section label="Tags">
          <Card variant="elevated" padding="lg">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(['primary','secondary','success','warning','error','neutral'] as const).map(c => (
                  <Tag key={c} color={c} dot>{c}</Tag>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(['solid','soft','outline'] as const).map(v => (
                  <Tag key={v} variant={v} color="primary">{v}</Tag>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(['sm','md','lg'] as const).map(s => (
                  <Tag key={s} size={s} color="secondary">Size {s}</Tag>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag removable onRemove={() => alert('removed')}>Removable</Tag>
                <Tag color="success" removable>AI Model</Tag>
                <Tag color="warning" dot>Beta</Tag>
              </div>
            </div>
          </Card>
        </Section>

        {/* Loaders */}
        <Section label="Loaders">
          <Card variant="elevated" padding="lg">
            <div className="space-y-8">
              <div className="flex flex-wrap items-center gap-16">
                <Loader variant="spinner" text="Loading…" />
                <Loader variant="dots"    text="Processing" />
                <Loader variant="pulse"   text="Searching" />
              </div>
              <div>
                <Typography variant="label" color="muted" className="mb-3 block">Skeleton</Typography>
                <div className="space-y-3">
                  <Skeleton height={40} />
                  <Skeleton height={16} lines={3} />
                  <div className="flex gap-3">
                    <Skeleton width={56} height={56} rounded />
                    <Skeleton height={56} />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        {/* Color Palette */}
        <Section label="Color Palette">
          <ColorPalette />
        </Section>
      </div>
    </div>
  )
}