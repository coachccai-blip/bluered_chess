// Reconnaissance des ouvertures et de leurs variantes (noms français), par position (gère les transpositions).
import { Chess } from 'chess.js';

export interface OpeningEntry {
  eco: string;
  name: string;
  variation?: string;
  /** Coups SAN depuis la position initiale, séparés par des espaces. */
  moves: string;
}

export interface OpeningMatch extends OpeningEntry {
  /** Nombre de demi-coups de la ligne reconnue. */
  ply: number;
}

// Sources : classification ECO, noms usuels en français. Les variantes sont volontairement les plus courantes.
export const OPENINGS: OpeningEntry[] = [
  // 1.e4 e5
  { eco: 'C20', name: 'Ouverture du pion roi', moves: 'e4 e5' },
  { eco: 'C40', name: 'Partie du cavalier roi', moves: 'e4 e5 Nf3' },
  { eco: 'C41', name: 'Défense Philidor', moves: 'e4 e5 Nf3 d6' },
  { eco: 'C42', name: 'Défense russe (Petrov)', moves: 'e4 e5 Nf3 Nf6' },
  { eco: 'C42', name: 'Défense russe (Petrov)', variation: 'ligne classique', moves: 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4' },
  { eco: 'C44', name: 'Partie écossaise', moves: 'e4 e5 Nf3 Nc6 d4' },
  { eco: 'C45', name: 'Partie écossaise', variation: 'ligne principale', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4' },
  { eco: 'C45', name: 'Partie écossaise', variation: 'variante Schmidt', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6' },
  { eco: 'C45', name: 'Partie écossaise', variation: 'variante classique', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5' },
  { eco: 'C44', name: 'Gambit écossais', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Bc4' },
  { eco: 'C44', name: 'Ouverture Ponziani', moves: 'e4 e5 Nf3 Nc6 c3' },
  { eco: 'C46', name: 'Partie des trois cavaliers', moves: 'e4 e5 Nf3 Nc6 Nc3' },
  { eco: 'C47', name: 'Partie des quatre cavaliers', moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6' },
  { eco: 'C48', name: 'Partie des quatre cavaliers', variation: 'variante espagnole', moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5' },
  { eco: 'C47', name: 'Partie des quatre cavaliers', variation: 'variante écossaise', moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6 d4' },
  { eco: 'C50', name: 'Partie italienne', moves: 'e4 e5 Nf3 Nc6 Bc4' },
  { eco: 'C50', name: 'Partie italienne', variation: 'Giuoco Piano', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5' },
  { eco: 'C53', name: 'Partie italienne', variation: 'Giuoco Piano, ligne c3', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3' },
  { eco: 'C54', name: 'Partie italienne', variation: 'Giuoco Pianissimo', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3' },
  { eco: 'C51', name: 'Gambit Evans', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4' },
  { eco: 'C55', name: 'Défense des deux cavaliers', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6' },
  { eco: 'C57', name: 'Défense des deux cavaliers', variation: 'attaque Fegatello (Cg5)', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5' },
  { eco: 'C55', name: 'Défense des deux cavaliers', variation: 'ligne calme d3', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3' },
  { eco: 'C50', name: 'Défense hongroise', moves: 'e4 e5 Nf3 Nc6 Bc4 Be7' },
  { eco: 'C60', name: 'Partie espagnole (Ruy Lopez)', moves: 'e4 e5 Nf3 Nc6 Bb5' },
  { eco: 'C65', name: 'Partie espagnole', variation: 'défense berlinoise', moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6' },
  { eco: 'C64', name: 'Partie espagnole', variation: 'défense classique', moves: 'e4 e5 Nf3 Nc6 Bb5 Bc5' },
  { eco: 'C63', name: 'Partie espagnole', variation: 'défense Schliemann', moves: 'e4 e5 Nf3 Nc6 Bb5 f5' },
  { eco: 'C62', name: 'Partie espagnole', variation: 'défense Steinitz', moves: 'e4 e5 Nf3 Nc6 Bb5 d6' },
  { eco: 'C68', name: 'Partie espagnole', variation: 'variante d\'échange', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6' },
  { eco: 'C70', name: 'Partie espagnole', variation: 'variante Morphy', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4' },
  { eco: 'C78', name: 'Partie espagnole', variation: 'variante Morphy, ligne principale', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O' },
  { eco: 'C80', name: 'Partie espagnole', variation: 'variante ouverte', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4' },
  { eco: 'C84', name: 'Partie espagnole', variation: 'variante fermée', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7' },
  { eco: 'C88', name: 'Partie espagnole', variation: 'variante fermée, ligne principale', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3' },
  { eco: 'C89', name: 'Partie espagnole', variation: 'attaque Marshall', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5' },
  { eco: 'C92', name: 'Partie espagnole', variation: 'variante fermée, ligne Zaitsev', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Bb7' },
  { eco: 'C96', name: 'Partie espagnole', variation: 'variante Tchigorine', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5' },
  { eco: 'C77', name: 'Partie espagnole', variation: 'variante Archangel', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O b5 Bb3 Bb7' },
  { eco: 'C25', name: 'Partie viennoise', moves: 'e4 e5 Nc3' },
  { eco: 'C26', name: 'Partie viennoise', variation: 'ligne Falkbeer (Cf6)', moves: 'e4 e5 Nc3 Nf6' },
  { eco: 'C29', name: 'Partie viennoise', variation: 'gambit viennois', moves: 'e4 e5 Nc3 Nf6 f4' },
  { eco: 'C23', name: 'Partie du fou', moves: 'e4 e5 Bc4' },
  { eco: 'C21', name: 'Gambit du centre', moves: 'e4 e5 d4 exd4' },
  { eco: 'C21', name: 'Gambit danois', moves: 'e4 e5 d4 exd4 c3' },
  { eco: 'C30', name: 'Gambit du roi', moves: 'e4 e5 f4' },
  { eco: 'C33', name: 'Gambit du roi accepté', moves: 'e4 e5 f4 exf4' },
  { eco: 'C34', name: 'Gambit du roi accepté', variation: 'gambit du cavalier roi', moves: 'e4 e5 f4 exf4 Nf3' },
  { eco: 'C33', name: 'Gambit du roi accepté', variation: 'gambit du fou', moves: 'e4 e5 f4 exf4 Bc4' },
  { eco: 'C30', name: 'Gambit du roi refusé', variation: 'défense classique', moves: 'e4 e5 f4 Bc5' },
  { eco: 'C31', name: 'Gambit du roi refusé', variation: 'contre-gambit Falkbeer', moves: 'e4 e5 f4 d5' },
  { eco: 'C20', name: 'Attaque Parham (Dh5)', moves: 'e4 e5 Qh5' },
  { eco: 'C20', name: 'Ouverture Alapin', moves: 'e4 e5 Ne2' },
  { eco: 'C40', name: 'Gambit letton', moves: 'e4 e5 Nf3 f5' },
  { eco: 'C40', name: 'Défense Damiano', moves: 'e4 e5 Nf3 f6' },
  { eco: 'C40', name: 'Contre-gambit du centre (Elephant)', moves: 'e4 e5 Nf3 d5' },
  // Sicilienne
  { eco: 'B20', name: 'Défense sicilienne', moves: 'e4 c5' },
  { eco: 'B22', name: 'Défense sicilienne', variation: 'variante Alapin', moves: 'e4 c5 c3' },
  { eco: 'B23', name: 'Défense sicilienne', variation: 'sicilienne fermée', moves: 'e4 c5 Nc3' },
  { eco: 'B21', name: 'Défense sicilienne', variation: 'attaque Grand Prix', moves: 'e4 c5 Nc3 Nc6 f4' },
  { eco: 'B21', name: 'Défense sicilienne', variation: 'gambit Morra', moves: 'e4 c5 d4 cxd4 c3' },
  { eco: 'B27', name: 'Défense sicilienne', variation: 'ligne principale (Cf3)', moves: 'e4 c5 Nf3' },
  { eco: 'B30', name: 'Défense sicilienne', variation: 'variante Rossolimo', moves: 'e4 c5 Nf3 Nc6 Bb5' },
  { eco: 'B51', name: 'Défense sicilienne', variation: 'variante Moscou', moves: 'e4 c5 Nf3 d6 Bb5+' },
  { eco: 'B40', name: 'Défense sicilienne', variation: 'variante Paulsen (e6)', moves: 'e4 c5 Nf3 e6' },
  { eco: 'B41', name: 'Défense sicilienne', variation: 'variante Kan', moves: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6' },
  { eco: 'B44', name: 'Défense sicilienne', variation: 'variante Taimanov', moves: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6' },
  { eco: 'B32', name: 'Défense sicilienne', variation: 'sicilienne ouverte', moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4' },
  { eco: 'B33', name: 'Défense sicilienne', variation: 'variante Sveshnikov', moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5' },
  { eco: 'B34', name: 'Défense sicilienne', variation: 'dragon accéléré', moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6' },
  { eco: 'B50', name: 'Défense sicilienne', variation: 'ligne d6', moves: 'e4 c5 Nf3 d6' },
  { eco: 'B54', name: 'Défense sicilienne', variation: 'sicilienne ouverte, ligne d6', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6' },
  { eco: 'B56', name: 'Défense sicilienne', variation: 'variante classique', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6' },
  { eco: 'B70', name: 'Défense sicilienne', variation: 'variante du dragon', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6' },
  { eco: 'B76', name: 'Défense sicilienne', variation: 'dragon, attaque yougoslave', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3' },
  { eco: 'B80', name: 'Défense sicilienne', variation: 'variante Scheveningue', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6' },
  { eco: 'B90', name: 'Défense sicilienne', variation: 'variante Najdorf', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6' },
  { eco: 'B90', name: 'Défense sicilienne', variation: 'Najdorf, attaque anglaise', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3' },
  { eco: 'B92', name: 'Défense sicilienne', variation: 'Najdorf, ligne Fe2', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2' },
  { eco: 'B96', name: 'Défense sicilienne', variation: 'Najdorf, ligne Fg5', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5' },
  { eco: 'B20', name: 'Défense sicilienne', variation: 'gambit de l\'aile', moves: 'e4 c5 b4' },
  // Française
  { eco: 'C00', name: 'Défense française', moves: 'e4 e6' },
  { eco: 'C01', name: 'Défense française', variation: 'variante d\'échange', moves: 'e4 e6 d4 d5 exd5' },
  { eco: 'C02', name: 'Défense française', variation: 'variante d\'avance', moves: 'e4 e6 d4 d5 e5' },
  { eco: 'C03', name: 'Défense française', variation: 'variante Tarrasch', moves: 'e4 e6 d4 d5 Nd2' },
  { eco: 'C10', name: 'Défense française', variation: 'variante Rubinstein', moves: 'e4 e6 d4 d5 Nc3 dxe4' },
  { eco: 'C11', name: 'Défense française', variation: 'variante classique', moves: 'e4 e6 d4 d5 Nc3 Nf6' },
  { eco: 'C11', name: 'Défense française', variation: 'variante Steinitz', moves: 'e4 e6 d4 d5 Nc3 Nf6 e5' },
  { eco: 'C15', name: 'Défense française', variation: 'variante Winawer', moves: 'e4 e6 d4 d5 Nc3 Bb4' },
  { eco: 'C00', name: 'Défense française', variation: 'attaque est-indienne', moves: 'e4 e6 d3' },
  // Caro-Kann
  { eco: 'B10', name: 'Défense Caro-Kann', moves: 'e4 c6' },
  { eco: 'B12', name: 'Défense Caro-Kann', variation: 'variante d\'avance', moves: 'e4 c6 d4 d5 e5' },
  { eco: 'B13', name: 'Défense Caro-Kann', variation: 'variante d\'échange', moves: 'e4 c6 d4 d5 exd5 cxd5' },
  { eco: 'B13', name: 'Défense Caro-Kann', variation: 'attaque Panov', moves: 'e4 c6 d4 d5 exd5 cxd5 c4' },
  { eco: 'B18', name: 'Défense Caro-Kann', variation: 'variante classique', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5' },
  { eco: 'B17', name: 'Défense Caro-Kann', variation: 'variante Steinitz (Cd7)', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7' },
  { eco: 'B15', name: 'Défense Caro-Kann', variation: 'variante Tartakover (Cf6)', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6' },
  { eco: 'B11', name: 'Défense Caro-Kann', variation: 'système des deux cavaliers', moves: 'e4 c6 Nc3 d5 Nf3' },
  { eco: 'B10', name: 'Défense Caro-Kann', variation: 'attaque fantôme (f3)', moves: 'e4 c6 d4 d5 f3' },
  // Autres 1.e4
  { eco: 'B01', name: 'Défense scandinave', moves: 'e4 d5' },
  { eco: 'B01', name: 'Défense scandinave', variation: 'ligne principale (Da5)', moves: 'e4 d5 exd5 Qxd5 Nc3 Qa5' },
  { eco: 'B01', name: 'Défense scandinave', variation: 'variante moderne (Cf6)', moves: 'e4 d5 exd5 Nf6' },
  { eco: 'B01', name: 'Défense scandinave', variation: 'ligne Dd6', moves: 'e4 d5 exd5 Qxd5 Nc3 Qd6' },
  { eco: 'B02', name: 'Défense Alekhine', moves: 'e4 Nf6' },
  { eco: 'B03', name: 'Défense Alekhine', variation: 'attaque des quatre pions', moves: 'e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 f4' },
  { eco: 'B04', name: 'Défense Alekhine', variation: 'variante moderne', moves: 'e4 Nf6 e5 Nd5 d4 d6 Nf3' },
  { eco: 'B07', name: 'Défense Pirc', moves: 'e4 d6 d4 Nf6 Nc3 g6' },
  { eco: 'B09', name: 'Défense Pirc', variation: 'attaque autrichienne', moves: 'e4 d6 d4 Nf6 Nc3 g6 f4' },
  { eco: 'B06', name: 'Défense moderne', moves: 'e4 g6' },
  { eco: 'B00', name: 'Défense Nimzowitsch', moves: 'e4 Nc6' },
  { eco: 'B00', name: 'Défense Owen', moves: 'e4 b6' },
  { eco: 'C20', name: 'Défense Nimzowitsch-Larsen', moves: 'e4 e5 b3' },
  // 1.d4 d5
  { eco: 'D00', name: 'Ouverture du pion dame', moves: 'd4 d5' },
  { eco: 'D06', name: 'Gambit dame', moves: 'd4 d5 c4' },
  { eco: 'D20', name: 'Gambit dame accepté', moves: 'd4 d5 c4 dxc4' },
  { eco: 'D26', name: 'Gambit dame accepté', variation: 'ligne classique', moves: 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5' },
  { eco: 'D30', name: 'Gambit dame refusé', moves: 'd4 d5 c4 e6' },
  { eco: 'D35', name: 'Gambit dame refusé', variation: 'variante d\'échange', moves: 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5' },
  { eco: 'D37', name: 'Gambit dame refusé', variation: 'ligne Fe7 (Harrwitz / classique)', moves: 'd4 d5 c4 e6 Nc3 Nf6 Nf3 Be7' },
  { eco: 'D63', name: 'Gambit dame refusé', variation: 'défense orthodoxe', moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7' },
  { eco: 'D58', name: 'Gambit dame refusé', variation: 'défense Tartakover', moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6' },
  { eco: 'D52', name: 'Gambit dame refusé', variation: 'défense Cambridge Springs', moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 e3 c6 Nf3 Qa5' },
  { eco: 'D32', name: 'Gambit dame refusé', variation: 'défense Tarrasch', moves: 'd4 d5 c4 e6 Nc3 c5' },
  { eco: 'D31', name: 'Gambit dame refusé', variation: 'semi-slave', moves: 'd4 d5 c4 e6 Nc3 c6' },
  { eco: 'D43', name: 'Défense semi-slave', moves: 'd4 d5 c4 c6 Nc3 Nf6 Nf3 e6' },
  { eco: 'D45', name: 'Défense semi-slave', variation: 'ligne e3', moves: 'd4 d5 c4 c6 Nc3 Nf6 Nf3 e6 e3' },
  { eco: 'D47', name: 'Défense semi-slave', variation: 'variante Meran', moves: 'd4 d5 c4 c6 Nc3 Nf6 Nf3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5' },
  { eco: 'D44', name: 'Défense semi-slave', variation: 'gambit Botvinnik', moves: 'd4 d5 c4 c6 Nc3 Nf6 Nf3 e6 Bg5 dxc4' },
  { eco: 'D10', name: 'Défense slave', moves: 'd4 d5 c4 c6' },
  { eco: 'D13', name: 'Défense slave', variation: 'variante d\'échange', moves: 'd4 d5 c4 c6 cxd5 cxd5' },
  { eco: 'D15', name: 'Défense slave', variation: 'ligne principale', moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3' },
  { eco: 'D17', name: 'Défense slave', variation: 'variante tchèque', moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5' },
  { eco: 'D07', name: 'Défense Tchigorine', moves: 'd4 d5 c4 Nc6' },
  { eco: 'D08', name: 'Contre-gambit Albin', moves: 'd4 d5 c4 e5' },
  { eco: 'D02', name: 'Système de Londres', moves: 'd4 d5 Nf3 Nf6 Bf4' },
  { eco: 'D02', name: 'Système de Londres', moves: 'd4 d5 Bf4' },
  { eco: 'D02', name: 'Système de Londres', variation: 'ligne principale', moves: 'd4 d5 Bf4 Nf6 e3' },
  { eco: 'A46', name: 'Système de Londres', variation: 'contre Cf6', moves: 'd4 Nf6 Bf4' },
  { eco: 'D05', name: 'Système Colle', moves: 'd4 d5 Nf3 Nf6 e3' },
  { eco: 'D05', name: 'Système Colle', variation: 'Colle-Zukertort', moves: 'd4 d5 Nf3 Nf6 e3 e6 Bd3 c5 b3' },
  { eco: 'D03', name: 'Attaque Torre', moves: 'd4 d5 Nf3 Nf6 Bg5' },
  { eco: 'A45', name: 'Attaque Trompowsky', moves: 'd4 Nf6 Bg5' },
  { eco: 'D00', name: 'Attaque Blackmar-Diemer', moves: 'd4 d5 e4' },
  { eco: 'D00', name: 'Ouverture Veresov', moves: 'd4 d5 Nc3 Nf6 Bg5' },
  { eco: 'D00', name: 'Attaque Stonewall', moves: 'd4 d5 e3 Nf6 Bd3 c5 c3 Nc6 f4' },
  // 1.d4 Cf6
  { eco: 'A40', name: 'Ouverture du pion dame', variation: 'défense indienne', moves: 'd4 Nf6' },
  { eco: 'A50', name: 'Défense indienne', variation: 'ligne c4', moves: 'd4 Nf6 c4' },
  { eco: 'E00', name: 'Défense indienne', variation: 'ligne e6', moves: 'd4 Nf6 c4 e6' },
  { eco: 'E20', name: 'Défense nimzo-indienne', moves: 'd4 Nf6 c4 e6 Nc3 Bb4' },
  { eco: 'E32', name: 'Défense nimzo-indienne', variation: 'variante classique (Dc2)', moves: 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2' },
  { eco: 'E40', name: 'Défense nimzo-indienne', variation: 'variante Rubinstein (e3)', moves: 'd4 Nf6 c4 e6 Nc3 Bb4 e3' },
  { eco: 'E21', name: 'Défense nimzo-indienne', variation: 'trois cavaliers', moves: 'd4 Nf6 c4 e6 Nc3 Bb4 Nf3' },
  { eco: 'E24', name: 'Défense nimzo-indienne', variation: 'variante Sämisch', moves: 'd4 Nf6 c4 e6 Nc3 Bb4 a3' },
  { eco: 'E30', name: 'Défense nimzo-indienne', variation: 'variante Leningrad', moves: 'd4 Nf6 c4 e6 Nc3 Bb4 Bg5' },
  { eco: 'E12', name: 'Défense ouest-indienne', moves: 'd4 Nf6 c4 e6 Nf3 b6' },
  { eco: 'E15', name: 'Défense ouest-indienne', variation: 'ligne fianchetto', moves: 'd4 Nf6 c4 e6 Nf3 b6 g3' },
  { eco: 'E12', name: 'Défense ouest-indienne', variation: 'variante Petrossian', moves: 'd4 Nf6 c4 e6 Nf3 b6 a3' },
  { eco: 'E11', name: 'Défense Bogo-indienne', moves: 'd4 Nf6 c4 e6 Nf3 Bb4+' },
  { eco: 'E00', name: 'Ouverture catalane', moves: 'd4 Nf6 c4 e6 g3' },
  { eco: 'E04', name: 'Ouverture catalane', variation: 'catalane ouverte', moves: 'd4 Nf6 c4 e6 g3 d5 Bg2 dxc4' },
  { eco: 'E06', name: 'Ouverture catalane', variation: 'catalane fermée', moves: 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7' },
  { eco: 'E60', name: 'Défense est-indienne', moves: 'd4 Nf6 c4 g6' },
  { eco: 'E61', name: 'Défense est-indienne', variation: 'ligne principale', moves: 'd4 Nf6 c4 g6 Nc3 Bg7' },
  { eco: 'E70', name: 'Défense est-indienne', variation: 'ligne e4', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4' },
  { eco: 'E90', name: 'Défense est-indienne', variation: 'variante classique', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5' },
  { eco: 'E97', name: 'Défense est-indienne', variation: 'classique, ligne Mar del Plata', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7' },
  { eco: 'E80', name: 'Défense est-indienne', variation: 'variante Sämisch', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3' },
  { eco: 'E76', name: 'Défense est-indienne', variation: 'attaque des quatre pions', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4' },
  { eco: 'E73', name: 'Défense est-indienne', variation: 'système Averbakh', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Be2 O-O Bg5' },
  { eco: 'E62', name: 'Défense est-indienne', variation: 'variante fianchetto', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 Nf3 d6 g3' },
  { eco: 'D80', name: 'Défense Grünfeld', moves: 'd4 Nf6 c4 g6 Nc3 d5' },
  { eco: 'D85', name: 'Défense Grünfeld', variation: 'variante d\'échange', moves: 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4' },
  { eco: 'D90', name: 'Défense Grünfeld', variation: 'ligne Cf3', moves: 'd4 Nf6 c4 g6 Nc3 d5 Nf3' },
  { eco: 'D82', name: 'Défense Grünfeld', variation: 'ligne Ff4', moves: 'd4 Nf6 c4 g6 Nc3 d5 Bf4' },
  { eco: 'A56', name: 'Défense Benoni', moves: 'd4 Nf6 c4 c5' },
  { eco: 'A60', name: 'Défense Benoni moderne', moves: 'd4 Nf6 c4 c5 d5 e6' },
  { eco: 'A57', name: 'Gambit Benko (Volga)', moves: 'd4 Nf6 c4 c5 d5 b5' },
  { eco: 'A52', name: 'Gambit de Budapest', moves: 'd4 Nf6 c4 e5' },
  { eco: 'A53', name: 'Défense vieille-indienne', moves: 'd4 Nf6 c4 d6' },
  { eco: 'A80', name: 'Défense hollandaise', moves: 'd4 f5' },
  { eco: 'A87', name: 'Défense hollandaise', variation: 'variante Leningrad', moves: 'd4 f5 c4 Nf6 g3 g6' },
  { eco: 'A90', name: 'Défense hollandaise', variation: 'Stonewall', moves: 'd4 f5 c4 Nf6 g3 e6 Bg2 d5' },
  { eco: 'A80', name: 'Défense hollandaise', variation: 'variante classique', moves: 'd4 f5 c4 Nf6 g3 e6 Bg2 Be7' },
  { eco: 'A40', name: 'Défense anglaise (b6)', moves: 'd4 e6 c4 b6' },
  { eco: 'A41', name: 'Défense moderne contre d4', moves: 'd4 d6' },
  { eco: 'A40', name: 'Gambit Englund', moves: 'd4 e5' },
  // Autres premiers coups
  { eco: 'A10', name: 'Ouverture anglaise', moves: 'c4' },
  { eco: 'A20', name: 'Ouverture anglaise', variation: 'sicilienne inversée', moves: 'c4 e5' },
  { eco: 'A25', name: 'Ouverture anglaise', variation: 'sicilienne inversée, ligne Cc3', moves: 'c4 e5 Nc3' },
  { eco: 'A28', name: 'Ouverture anglaise', variation: 'quatre cavaliers', moves: 'c4 e5 Nc3 Nf6 Nf3 Nc6' },
  { eco: 'A30', name: 'Ouverture anglaise', variation: 'symétrique', moves: 'c4 c5' },
  { eco: 'A34', name: 'Ouverture anglaise', variation: 'symétrique, ligne Cc3', moves: 'c4 c5 Nc3' },
  { eco: 'A15', name: 'Ouverture anglaise', variation: 'anglo-indienne', moves: 'c4 Nf6' },
  { eco: 'A13', name: 'Ouverture anglaise', variation: 'ligne e6', moves: 'c4 e6' },
  { eco: 'A11', name: 'Ouverture anglaise', variation: 'système Caro-Kann', moves: 'c4 c6' },
  { eco: 'A04', name: 'Ouverture Réti', moves: 'Nf3' },
  { eco: 'A06', name: 'Ouverture Réti', variation: 'ligne d5', moves: 'Nf3 d5' },
  { eco: 'A09', name: 'Ouverture Réti', variation: 'gambit Réti', moves: 'Nf3 d5 c4' },
  { eco: 'A07', name: 'Attaque est-indienne', moves: 'Nf3 d5 g3' },
  { eco: 'A05', name: 'Ouverture Réti', variation: 'ligne Cf6', moves: 'Nf3 Nf6' },
  { eco: 'A02', name: 'Ouverture Bird', moves: 'f4' },
  { eco: 'A03', name: 'Ouverture Bird', variation: 'ligne d5', moves: 'f4 d5' },
  { eco: 'A02', name: 'Ouverture Bird', variation: 'gambit From', moves: 'f4 e5' },
  { eco: 'A01', name: 'Ouverture Larsen (b3)', moves: 'b3' },
  { eco: 'A00', name: 'Ouverture Sokolsky (b4, orang-outan)', moves: 'b4' },
  { eco: 'A00', name: 'Ouverture Grob (g4)', moves: 'g4' },
  { eco: 'A00', name: 'Ouverture hongroise (g3)', moves: 'g3' },
  { eco: 'A00', name: 'Ouverture Van\'t Kruijs (e3)', moves: 'e3' },
  { eco: 'A00', name: 'Ouverture Dunst (Cc3)', moves: 'Nc3' },
  { eco: 'A00', name: 'Ouverture Anderssen (a3)', moves: 'a3' },
  { eco: 'A00', name: 'Ouverture Saragosse (c3)', moves: 'c3' },
  { eco: 'A00', name: 'Ouverture polonaise inversée (d3)', moves: 'd3' },
  { eco: 'B00', name: 'Ouverture du pion roi', moves: 'e4' },
  { eco: 'A40', name: 'Ouverture du pion dame', moves: 'd4' },
];

/** Clé de position : placement + trait (sans droits de roque ni compteurs). */
function key(fen: string): string {
  return fen.split(' ').slice(0, 2).join(' ');
}

let index: Map<string, OpeningMatch> | null = null;

/** Construit l'index position -> ouverture (la ligne la plus longue l'emporte pour une même position). */
export function openingIndex(): Map<string, OpeningMatch> {
  if (index) return index;
  index = new Map();
  for (const o of OPENINGS) {
    const c = new Chess();
    const sans = o.moves.split(' ');
    let ok = true;
    for (const san of sans) {
      try {
        c.move(san);
      } catch {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const k = key(c.fen());
    const existing = index.get(k);
    if (!existing || existing.ply < sans.length) index.set(k, { ...o, ply: sans.length });
  }
  return index;
}

export function openingForFen(fen: string): OpeningMatch | null {
  return openingIndex().get(key(fen)) ?? null;
}

/** Ouverture la plus précise reconnue le long de la partie, et le demi-coup où elle est apparue. */
export function openingForGame(sans: string[], startFen?: string): (OpeningMatch & { atPly: number }) | null {
  if (startFen && !startFen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')) return null;
  const c = new Chess();
  let best: (OpeningMatch & { atPly: number }) | null = null;
  const limit = Math.min(sans.length, 30);
  for (let i = 0; i < limit; i++) {
    try {
      c.move(sans[i]);
    } catch {
      break;
    }
    const m = openingForFen(c.fen());
    if (m) best = { ...m, atPly: i + 1 };
  }
  return best;
}

/** Nouvelle reconnaissance au demi-coup `ply` (différente de la précédente) : à annoncer. */
export function openingAnnouncement(sans: string[], ply: number): OpeningMatch | null {
  if (ply < 1 || ply > 30) return null;
  const before = openingForGame(sans.slice(0, ply - 1));
  const after = openingForGame(sans.slice(0, ply));
  if (!after || after.atPly !== ply) return null;
  if (before && before.name === after.name && before.variation === after.variation) return null;
  return after;
}

export function openingLabel(o: Pick<OpeningEntry, 'name' | 'variation'>): string {
  return o.variation ? `${o.name}, ${o.variation}` : o.name;
}
