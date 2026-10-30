export type InscricaoTermCode =
  | 'NORMAS_EAC'
  | 'VERACIDADE_DADOS'
  | 'USO_IMAGEM_VOZ'
  | 'CIENCIA_PRIVACIDADE'
  | 'AUTORIZACAO_PARTICIPACAO';

export type InscricaoTerm = {
  codigo: InscricaoTermCode;
  titulo: string;
  versao: string;
  obrigatorio: boolean;
  tipo_resposta: 'ACEITE' | 'SIM_NAO';
  resumo: string;
  texto: string;
};

export const INSCRICAO_TERMS_VERSION = '2026.10-v0.2';

export const INSCRICAO_TERMS: InscricaoTerm[] = [
  {
    codigo: 'AUTORIZACAO_PARTICIPACAO',
    titulo: 'Autorização de participação no EAC e ciência das regras de acesso',
    versao: INSCRICAO_TERMS_VERSION,
    obrigatorio: true,
    tipo_resposta: 'ACEITE',
    resumo: 'Autoriza a participação do adolescente no retiro e declara ciência sobre o acesso dos responsáveis.',
    texto:
      "Autorizo o adolescente identificado nesta inscrição a participar do EAC, que será realizado nas dependências da Paróquia Porciúncula de Sant'ana.\\n\\nComo é de conhecimento de todos, o EAC é um retiro e não será permitida a entrada de responsáveis que não estejam trabalhando no Encontro.\\n\\nAs exceções serão apenas para:\\n- Responsáveis pelos encontristas (adolescentes que estarão fazendo o Encontro) que desejarem ir à capela para participar exclusivamente da vigília. Porém, fica registrado que não terão contato com seus filhos neste momento.\\n- Entrada de responsáveis em situação e horário previamente alinhados com a organização.\\n\\nA autorização é confirmada eletronicamente pelo responsável identificado no cadastro, com registro de data, hora e versão dos termos.",
  },

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
      'Na qualidade de responsável legal, autorizo, de forma gratuita, a captação e o uso da imagem e da voz do adolescente em fotografias e vídeos produzidos durante atividades do EAC, exclusivamente para divulgação institucional e memória das atividades do EAC e da comunidade/paróquia a ele vinculada, inclusive nas redes sociais do EAC e Quadrante, site, apresentações, materiais impressos e meios digitais institucionais, sem ônus para o movimento ou para a Paróquia Porciúncula de Sant'ana. Quando estritamente necessário às finalidades informadas e conforme as regras de privacidade, a divulgação poderá utilizar nome, data de nascimento e identificador de Instagram do adolescente para comunicação entre participantes. Esta autorização não permite utilização com finalidade comercial alheia às atividades institucionais do EAC. A opção de não autorizar o uso de imagem e voz não impede a participação do adolescente no encontro.',
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
