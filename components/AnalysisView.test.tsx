import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AnalysisView } from './AnalysisView';
import { Project } from '../types';
import { vi } from 'vitest';
import * as storage from '../services/storage';

// Mock ReactPlayer to easily inspect its props
vi.mock('react-player', () => {
  return {
    default: function MockReactPlayer(props: any) {
      return (
        <div data-testid="react-player" data-url={props.url}>
          Mock Player
        </div>
      );
    }
  };
});

describe('AnalysisView', () => {
  it('loads and displays a real YouTube video link correctly in the video player', async () => {
    const mockProject: Project = {
      id: 'test-123',
      name: 'Test Project',
      updatedAt: Date.now(),
      videoUrl: 'https://youtu.be/e2DJ3UPOvJM?si=YmZiVhqSxe9uCqAi',
      status: 'idle',
      actionCount: 0,
      durationInput: '10:00',
      chunkSize: 60,
      overlap: 30,
      customContext: '',
      chunks: [],
      actions: [],
      narrativeSteps: [],
      procState: {
        status: 'idle',
        currentChunkIndex: 0,
        totalActions: 0,
        totalTokens: 0,
        startTime: null,
        lastInteractionId: null,
        chatHistory: [],
        logs: []
      },
      latestUIState: null
    };

    vi.spyOn(storage, 'getProject').mockResolvedValue(mockProject);
    vi.spyOn(storage, 'saveProject').mockResolvedValue();

    render(
      <AnalysisView 
        projectId="test-123"
        onBack={() => {}}
      />
    );

    // Wait for project data to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('https://youtu.be/e2DJ3UPOvJM?si=YmZiVhqSxe9uCqAi')).toBeInTheDocument();
    });

    // Click "Hide Settings" to show the video player
    const hideButton = screen.getByText(/Hide Settings/i);
    fireEvent.click(hideButton);

    // Wait for the player to be rendered
    const player = await screen.findByTestId('react-player');
    expect(player).toBeInTheDocument();

    // Check if the URL was normalized correctly
    expect(player).toHaveAttribute('data-url', 'https://www.youtube.com/watch?v=e2DJ3UPOvJM');
  });
});
