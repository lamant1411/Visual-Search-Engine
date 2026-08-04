import React from 'react'

interface ColorSwatchProps {
    name: string
    hex: string
    token: string
}

const ColorSwatch: React.FC<ColorSwatchProps> = ({ name, hex, token }) => (
    <div className="flex flex-col gap-1.5">
        <div
            className="w-full h-14 rounded-[10px] shadow-sm border border-black/5 transition-transform duration-200 hover:scale-105 cursor-pointer"
            style={{ backgroundColor: hex }}
            title={hex}
        />
        <div>
            <p className="text-xs font-semibold text-slate-900">{name}</p>
            <p className="text-xs text-slate-600 font-mono">{hex}</p>
            <p className="text-[10px] text-slate-400">{token}</p>
        </div>
    </div>
)

interface PaletteGroupProps {
    title: string
    colors: ColorSwatchProps[]
}

const PaletteGroup: React.FC<PaletteGroupProps> = ({ title, colors }) => (
    <div className="mb-8">
        <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-4">{title}</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {colors.map((c) => <ColorSwatch key={c.token} {...c} />)}
        </div>
    </div>
)

export const ColorPalette: React.FC = () => {
    const groups: PaletteGroupProps[] = [
        {
            title: 'Brand',
            colors: [
                { name: 'Primary Dark', hex: '#1d4ed8', token: '--color-primary-dark' },   // blue-700
                { name: 'Primary', hex: '#2563eb', token: '--color-primary' },        // blue-600
                { name: 'Primary Light', hex: '#3b82f6', token: '--color-primary-light' },  // blue-500
                { name: 'Secondary Dark', hex: '#cbd5e1', token: '--color-secondary-dark' }, // slate-300
                { name: 'Secondary', hex: '#e2e8f0', token: '--color-secondary' },      // slate-200
                { name: 'Secondary Light', hex: '#f8fafc', token: '--color-secondary-light' },// slate-50
            ],
        },
        {
            title: 'Surface',
            colors: [
                { name: 'Surface', hex: '#f1f5f9', token: '--color-surface' },          // slate-100
                { name: 'Surface Card', hex: '#ffffff', token: '--color-surface-card' },     // white
                { name: 'Surface Elevated', hex: '#f8fafc', token: '--color-surface-elevated' }, // slate-50
            ],
        },
        {
            title: 'Text',
            colors: [
                { name: 'Text Primary', hex: '#0f172a', token: '--color-text-primary' },   // slate-900
                { name: 'Text Secondary', hex: '#475569', token: '--color-text-secondary' }, // slate-600
                { name: 'Text Muted', hex: '#94a3b8', token: '--color-text-muted' },     // slate-400
            ],
        },
        {
            title: 'Semantic',
            colors: [
                { name: 'Success', hex: '#16a34a', token: '--color-success' }, // green-600
                { name: 'Warning', hex: '#d97706', token: '--color-warning' }, // amber-600
                { name: 'Error', hex: '#dc2626', token: '--color-error' },   // red-600
            ],
        },
    ]

    return (
        <div className="bg-white rounded-[16px] p-6 border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                Color Palette
            </h2>
            {groups.map((g) => <PaletteGroup key={g.title} {...g} />)}
        </div>
    )
}

export default ColorPalette