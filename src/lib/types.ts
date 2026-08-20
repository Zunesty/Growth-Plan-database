export type OutboundMethod = "keynote" | "podcast" | "interview" | "direct";

export type FormData = {
  salespersonName: string;
  prospectFirstName: string;
  prospectLastName: string;
  prospectCompany: string;
  interviewTranscript: string;
  discoveryTranscript: string;
  whatDoTheySell: string;
  icp: string;
  avgContractValue: string;
  biggestProblem: string;
  whatTheyDontWant: string;
  currentState: string;
  endState: string;
  recommendedOutboundMethod: OutboundMethod;
};
