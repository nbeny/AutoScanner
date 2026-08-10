import { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { PREVIEW_SCAN_COMMAND_QUERY } from '../../lib/graphql/queries';

interface PreviewData {
  previewScanCommand: { image: string; argv: string[]; note: string | null };
}

/**
 * Debounced live preview of the exact command a scanner will run, from the
 * server (`previewScanCommand`). Skips while scanner/target is empty. `debounceMs`
 * is injectable so tests can disable the delay.
 */
export function useScanCommandPreview(
  scannerName: string,
  target: string,
  optionsJson: string,
  debounceMs = 300,
): { image: string; argv: string[]; note: string | null; loading: boolean } {
  const [debounced, setDebounced] = useState({ target, optionsJson });
  useEffect(() => {
    const id = setTimeout(() => setDebounced({ target, optionsJson }), debounceMs);
    return () => clearTimeout(id);
  }, [target, optionsJson, debounceMs]);

  const skip = !scannerName || !debounced.target;
  const { data, loading } = useQuery<PreviewData>(PREVIEW_SCAN_COMMAND_QUERY, {
    skip,
    variables: { scannerName, target: debounced.target, optionsJson: debounced.optionsJson },
    fetchPolicy: 'cache-and-network',
  });

  const p = data?.previewScanCommand;
  return { image: p?.image ?? '', argv: p?.argv ?? [], note: p?.note ?? null, loading };
}
