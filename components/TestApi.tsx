
import React, { useState, useEffect } from 'react';
import { sanitizeTextDeep } from '../utils/textEncoding.ts';

const TestApi: React.FC = () => {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const testApi = async () => {
      try {
        const response = await fetch('/api/comunicados', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'GET_COMUNICADOS',
            data: {},
            googleWebAppUrl: 'https://script.google.com/macros/s/AKfycbz-g7G932JO1hhg_h_5tA4d3E4i-0l2b8x5d8s7A/exec'
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data = sanitizeTextDeep(await response.json());
        setResult(data);
      } catch (e: any) {
        setError(e.message);
      }
    };

    testApi();
  }, []);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!result) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>API Test Result:</h2>
      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
};

export default TestApi;
