import React from 'react'
import { render, screen } from '@testing-library/react'
import AppLayout from '../AppLayout'

describe('AppLayout', () => {
  it('renders sidebar and main content', () => {
    render(
      <AppLayout sidebar={<div>Sidebar content</div>}>
        <div>Main content</div>
      </AppLayout>
    )

    expect(screen.getByText('Sidebar content')).toBeInTheDocument()
    expect(screen.getByText('Main content')).toBeInTheDocument()
  })
})
