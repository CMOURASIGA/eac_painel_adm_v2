export type InscricaoTermCode =
  | 'NORMAS_EAC'
  | 'VERACIDADE_DADOS'
  | 'USO_IMAGEM_VOZ'
  | 'CIENCIA_PRIVACIDADE';

export type InscricaoTerm = {
  codigo: InscricaoTermCode;
  titulo: string;
  versao: string;
  obrigatorio: boolean;
  tipo_resposta: 'ACEITE' | 'SIM_NAO';
  resumo: string;
  texto: string;
};

export const INSCRICAO_TERMS_VERSION = '2026.10-v0.1';

export const INSCRICAO_TERMS: InscricaoTerm[] = [
  {
    codigo: 'NORMAS_EAC',
    titulo: 'Ciência e concordância com as normas de participação do EAC',
    versao: INSCRICAO_TERMS_VERSION,
    obrigatorio: true,
    tipo_resposta: 'ACEITE',
    resumo: 'Confirma que o responsável tomou ciência das regras de participação e convivência aplicáveis ao encontro.',
    texto:
      'Na qualidade de responsável legal pelo adolescente identificado nesta inscrição, declaro que tive acesso às orientações e normas de participação apresentadas pelo EAC e estou de acordo com o cumprimento das regras de convivência, organização e segurança aplicáveis às atividades do encontro. Declaro ainda estar ciente de que a organização poderá entrar em contato comigo sempre que necessário para assuntos relacionados à participação do adolescente.',
  },
  {
    codigo: 'VERACIDADE_DADOS',
    titulo: 'Declaração de responsabilidade pelas informações',
    versao: INSCRICAO_TERMS_VERSION,
    obrigatorio: true,
    tipo_resposta: 'ACEITE',
    resumo: 'Confirma que os dados informados na inscrição foram revisados pelo responsável e são verdadeiros.',
    texto:
      'Declaro, na qualidade de responsável legal, que revisei os dados principais apresentados nesta inscrição e que, segundo meu conhecimento, as informações fornecidas são verdadeiras e suficientes para a organização do EAC. Comprometo-me a comunicar à organização eventual alteração relevante dos dados do adolescente ou do responsável.',
  },
  {
    codigo: 'USO_IMAGEM_VOZ',
    titulo: 'Autorização de uso de imagem e voz',
    versao: INSCRICAO_TERMS_VERSION,
    obrigatorio: false,
    tipo_resposta: 'SIM_NAO',
    resumo: 'Permite escolher expressamente se o EAC poderá utilizar imagem e voz do adolescente em divulgações institucionais.',
    texto:
      'Na qualidade de responsável legal, autorizo, de forma gratuita, a captação e o uso da imagem e da voz do adolescente em fotografias e vídeos produzidos durante atividades do EAC, exclusivamente para divulgação institucional e memória das atividades do EAC e da comunidade/paróquia a ele vinculada, inclusive em redes sociais, site, apresentações, materiais impressos e meios digitais institucionais. Esta autorização não permite utilização com finalidade comercial alheia às atividades institucionais do EAC. A opção de não autorizar o uso de imagem e voz não impede a participação do adolescente no encontro.',
  },
  {
    codigo: 'CIENCIA_PRIVACIDADE',
    titulo: 'Ciência sobre tratamento de dados pessoais',
    versao: INSCRICAO_TERMS_VERSION,
    obrigatorio: true,
    tipo_resposta: 'ACEITE',
    resumo: 'Informa a finalidade de uso dos dados necessários à inscrição, organização, contato e segurança do encontro.',
    texto:
      'Declaro ciência de que os dados pessoais informados nesta inscrição serão utilizados pelo EAC para fins de cadastro, organização e gestão do encontro, comunicação com o adolescente e seu responsável, controle de participação e demais atividades diretamente relacionadas ao EAC. O tratamento deverá observar o melhor interesse do adolescente, limitar-se aos dados necessários às finalidades informadas e adotar medidas adequadas de proteção e controle de acesso.',
  },
];

export function getInscricaoTermsSnapshot() {
  return INSCRICAO_TERMS.map((term) => ({ ...term }));
}

export function requiredTermsAccepted(respostas: Record<string, string>) {
  return INSCRICAO_TERMS
    .filter((term) => term.obrigatorio)
    .every((term) => String(respostas?.[term.codigo] || '').toUpperCase() === 'ACEITO');
}
