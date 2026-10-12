import { expect, test } from '@playwright/test';

test('QR identifica a sessão, confirma presença e impede repetição na mesma sessão', async ({ page }) => {
  await page.goto('/presenca/form?session=mock-qr-mock-session-1');
  await expect(page.getByRole('heading', { name: /Reunião de tios/i })).toBeVisible();
  await page.getByLabel(/Digite parte do seu nome/i).fill('Pessoa Fictícia Um');
  await page.getByRole('button', { name: 'Pessoa Fictícia Um' }).click();
  await page.getByLabel(/Confirme seu telefone/i).fill('21999990001');
  await page.getByRole('button', { name: /Confirmar presença/i }).click();
  await expect(page.getByText('Presença confirmada nesta sessão.')).toBeVisible();
  await page.getByRole('button', { name: /Confirmar presença/i }).click();
  await expect(page.getByText('Sua presença já foi registrada nesta sessão.')).toBeVisible();
});

test('nome não localizado gera análise sem criação automática', async ({ page }) => {
  await page.goto('/presenca/form?session=mock-qr-mock-session-2');
  await page.getByLabel(/Digite parte do seu nome/i).fill('Visitante Fictício');
  await page.getByLabel(/Confirme seu telefone/i).fill('21999990123');
  await page.getByRole('button', { name: /Enviar para análise/i }).click();
  await expect(page.getByText(/Recebemos sua solicitação/i)).toBeVisible();
});
