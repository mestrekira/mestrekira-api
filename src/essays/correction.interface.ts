export interface EnemCompetencies {
  c1: number; // Norma culta
  c2: number; // Compreensão do tema
  c3: number; // Argumentação
  c4: number; // Coesão
  c5: number; // Proposta de intervenção
}

export interface Correction {
  essayId: string;
  teacherId: string;
  competencies: EnemCompetencies;
  feedbackGeneral: string;
  feedbackByCompetency?: Partial<Record<keyof EnemCompetencies, string>>;
  totalScore: number;
}
